import { Uri, ExtensionContext, workspace, languages } from 'coc.nvim'
import { Range, CompletionItem, TextDocument, Position, CancellationToken, CompletionContext, TextEdit, MarkupContent, MarkupKind, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver-protocol'
import child_process from 'child_process'
import semver from 'semver'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { Mutex } from 'await-semaphore'

const CHAR_LIMIT = 100000
const MAX_NUM_RESULTS = 5
const DEFAULT_DETAIL = "TabNine"

export async function activate(context: ExtensionContext): Promise<void> {
  const configuration = workspace.getConfiguration('tabnine')
  const tabNine = new TabNine()

  const triggers = []
  for (let i = 32; i <= 126; i++) {
    triggers.push(String.fromCharCode(i))
  }
  let priority = configuration.get<number>('priority', 100)
  let disable_filetyps = configuration.get<string[]>('disable_filetyps', [])

  languages.registerCompletionItemProvider('tabnine', configuration.get<string>('shortcut', 'TN'), null, {
    async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): Promise<CompletionItem[] | undefined | null> {
      if (disable_filetyps.includes(document.languageId)) return null
      try {
        const offset = document.offsetAt(position)
        const before_start_offset = Math.max(0, offset - CHAR_LIMIT)
        const after_end_offset = offset + CHAR_LIMIT
        const before_start = document.positionAt(before_start_offset)
        const after_end = document.positionAt(after_end_offset)
        const before = document.getText(Range.create(before_start, position))
        const after = document.getText(Range.create(position, after_end))
        const request = tabNine.request("1.0.7", {
          Autocomplete: {
            filename: Uri.parse(document.uri).fsPath,
            before,
            after,
            region_includes_beginning: (before_start_offset === 0),
            region_includes_end: (document.offsetAt(after_end) !== after_end_offset),
            max_num_results: MAX_NUM_RESULTS,
          }
        })
        if (!completionIsAllowed(document, position)) {
          return undefined
        }
        const response: AutocompleteResult = await request
        let completionList: CompletionItem[]
        if (response.results.length === 0) {
          completionList = []
        } else {
          const results = []
          let detailMessage = ""
          for (const msg of response.user_message) {
            if (detailMessage !== "") {
              detailMessage += "\n"
            }
            detailMessage += msg
          }
          if (detailMessage === "") {
            detailMessage = DEFAULT_DETAIL
          }
          let index = 0
          for (const entry of response.results) {
            results.push(makeCompletionItem({
              document,
              index,
              position,
              detailMessage,
              old_prefix: response.old_prefix,
              entry,
            }))
            index += 1
          }
          completionList = results
        }
        return completionList
      } catch (e) {
        // tslint:disable-next-line: no-console
        console.log(`Error setting up request: ${e}`)
      }
    }
  }, triggers, priority)

  function makeCompletionItem(args: {
    document: TextDocument,
    index: number,
    position: Position,
    detailMessage: string,
    old_prefix: string,
    entry: ResultEntry,
  }): CompletionItem {
    let item: CompletionItem = {
      label: args.entry.new_prefix + args.entry.new_suffix
    }
    item.sortText = new Array(args.index + 2).join('0')
    let start: Position = {
      line: args.position.line,
      character: args.position.character - (args.old_prefix ? args.old_prefix.length : 0)
    }
    let end: Position = {
      line: args.position.line,
      character: args.position.character + (args.entry.old_suffix ? args.entry.old_suffix.length : 0)
    }
    let { new_prefix, new_suffix } = args.entry
    let newText = new_prefix
    if (new_suffix) {
      newText = `${new_prefix}$1${new_suffix}`
      item.insertTextFormat = InsertTextFormat.Snippet
    }
    item.textEdit = TextEdit.replace(Range.create(start, end), newText)
    if (args.entry.documentation) {
      item.documentation = formatDocumentation(args.entry.documentation)
    }
    if (args.entry.detail) {
      if (args.detailMessage === DEFAULT_DETAIL || args.detailMessage.includes("Your project contains")) {
        item.detail = args.entry.detail
      } else {
        item.detail = args.detailMessage
      }
    } else {
      item.detail = args.detailMessage
    }
    item.preselect = (args.index === 0)
    item.kind = args.entry.kind
    return item
  }

  function formatDocumentation(documentation: string | MarkdownStringSpec): string | MarkupContent {
    if (isMarkdownStringSpec(documentation)) {
      if (documentation.kind == "markdown") {
        return {
          kind: MarkupKind.Markdown,
          value: documentation.value
        }
      } else {
        return documentation.value
      }
    } else {
      return documentation
    }
  }

  function isMarkdownStringSpec(x: any): x is MarkdownStringSpec {
    return x.kind
  }

  function completionIsAllowed(document: TextDocument, position: Position): boolean {
    let disable_line_regex = configuration.get<string[]>('disable_line_regex')
    if (disable_line_regex === undefined) {
      disable_line_regex = []
    }
    let line
    for (const r of disable_line_regex) {
      if (line === undefined) {
        line = document.getText(Range.create(
          { line: position.line, character: 0 },
          { line: position.line, character: 500 }
        ))
      }
      if (new RegExp(r).test(line)) {
        return false
      }
    }
    let disable_file_regex = configuration.get<string[]>('disable_file_regex')
    if (disable_file_regex === undefined) {
      disable_file_regex = []
    }
    for (const r of disable_file_regex) {
      let fileName = Uri.parse(document.uri).fsPath
      if (new RegExp(r).test(fileName)) {
        return false
      }
    }
    return true
  }
}

interface AutocompleteResult {
  old_prefix: string,
  results: ResultEntry[],
  user_message: string[],
}

interface ResultEntry {
  new_prefix: string,
  old_suffix: string,
  new_suffix: string,

  kind?: CompletionItemKind,
  detail?: string,
  documentation?: string | MarkdownStringSpec,
  deprecated?: boolean
}

interface MarkdownStringSpec {
  kind: string,
  value: string
}

class TabNine {
  private proc: child_process.ChildProcess
  private rl: readline.ReadLine
  private numRestarts = 0
  private childDead: boolean
  private mutex: Mutex = new Mutex()

  constructor() {
    // noop
  }

  public async request(version: string, any_request: any): Promise<any> {
    const release = await this.mutex.acquire()
    try {
      return await this.requestUnlocked(version, any_request)
    } finally {
      release()
    }
  }

  private requestUnlocked(version: string, any_request: any): Promise<any> {
    any_request = {
      version,
      request: any_request
    }
    const request = JSON.stringify(any_request) + '\n'
    return new Promise<any>((resolve, reject) => {
      try {
        if (!this.isChildAlive()) {
          this.restartChild()
        }
        if (!this.isChildAlive()) {
          reject(new Error("TabNine process is dead."))
        }
        this.rl.once('line', response => {
          let any_response: any = JSON.parse(response.toString())
          resolve(any_response)
        })
        this.proc.stdin.write(request, "utf8")
      } catch (e) {
        // tslint:disable-next-line: no-console
        console.log(`Error interacting with TabNine: ${e}`)
        reject(e)
      }
    })
  }

  private isChildAlive(): boolean {
    return this.proc && !this.childDead
  }

  private restartChild(): void {
    if (this.numRestarts >= 10) {
      return
    }
    this.numRestarts += 1
    if (this.proc) {
      this.proc.kill()
    }
    const args = [
      "--client=vscode",
    ]
    const binary_root = path.join(__dirname, "..", "binaries")
    const command = TabNine.getBinaryPath(binary_root)
    this.proc = child_process.spawn(command, args)
    this.childDead = false
    this.proc.on('exit', (code, signal) => {
      this.childDead = true
    })
    this.proc.stdin.on('error', error => {
      // tslint:disable-next-line: no-console
      console.log(`stdin error: ${error}`)
      this.childDead = true
    })
    this.proc.stdout.on('error', error => {
      // tslint:disable-next-line: no-console
      console.log(`stdout error: ${error}`)
      this.childDead = true
    })
    this.proc.unref() // AIUI, this lets Node exit without waiting for the child
    this.rl = readline.createInterface({
      input: this.proc.stdout,
      output: this.proc.stdin
    })
  }

  private static getBinaryPath(root): string {
    let arch
    if (process.arch == 'x32') {
      arch = 'i686'
    } else if (process.arch == 'x64') {
      arch = 'x86_64'
    } else {
      throw new Error(`Sorry, the architecture '${process.arch}' is not supported by TabNine.`)
    }
    let suffix
    if (process.platform == 'win32') {
      suffix = 'pc-windows-gnu/TabNine.exe'
    } else if (process.platform == 'darwin') {
      suffix = 'apple-darwin/TabNine'
    } else if (process.platform == 'linux') {
      suffix = 'unknown-linux-gnu/TabNine'
    } else {
      throw new Error(`Sorry, the platform '${process.platform}' is not supported by TabNine.`)
    }
    const versions = fs.readdirSync(root)
    TabNine.sortBySemver(versions)
    const tried = []
    for (let version of versions) {
      const full_path = `${root}/${version}/${arch}-${suffix}`
      tried.push(full_path)
      if (fs.existsSync(full_path)) {
        return full_path
      }
    }
    throw new Error(`Couldn't find a TabNine binary (tried the following paths: versions=${versions} ${tried})`)
  }

  private static sortBySemver(versions: string[]): void {
    versions.sort(TabNine.cmpSemver)
  }

  private static cmpSemver(a, b): number {
    const a_valid = semver.valid(a)
    const b_valid = semver.valid(b)
    if (a_valid && b_valid) { return semver.rcompare(a, b) }
    else if (a_valid) { return -1 }
    else if (b_valid) { return 1 }
    else if (a < b) { return -1 }
    else if (a > b) { return 1 }
    else { return 0 }
  }
}
