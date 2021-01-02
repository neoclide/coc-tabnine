import { Mutex } from 'await-semaphore'
import child_process from 'child_process'
import { commands, ExtensionContext, fetch, languages, Uri, window, workspace } from 'coc.nvim'
import fs from 'fs'
import mkdirp from 'mkdirp'
import path from 'path'
import readline from 'readline'
import semver from 'semver'
import { CancellationToken, CompletionContext, CompletionItem, CompletionItemKind, CompletionList, InsertTextFormat, MarkupContent, MarkupKind, Position, Range, TextDocument, TextEdit } from 'vscode-languageserver-protocol'
import download from './download'

const CHAR_LIMIT = 100000
const MAX_NUM_RESULTS = 5
const DEFAULT_DETAIL = "TabNine"

export async function activate(context: ExtensionContext): Promise<void> {
  const configuration = workspace.getConfiguration('tabnine')
  const { subscriptions } = context

  const binaryPath = configuration.get<string>('binary_path', undefined)
  const disable_filetypes = configuration.get<string[]>('disable_filetypes', [])
  const limit = configuration.get<number>('limit', 10)
  const priority = configuration.get<number>('priority', undefined)

  const tabNine = new TabNine(context.storagePath, binaryPath)
  if (!binaryPath) {
    const binaryRoot = path.join(context.storagePath, 'binaries')
    await TabNine.installTabNine(binaryRoot)
  } else {
    if (!fs.existsSync(binaryPath)) {
      throw new Error('Specified path to TabNine binary not found. ' + binaryPath)
    }
  }

  subscriptions.push(commands.registerCommand('tabnine.openConfig', async () => {
    const res = await tabNine.request("2.0.0", {
      Autocomplete: {
        filename: '1',
        before: 'TabNine::config_dir',
        after: '\n',
        region_includes_beginning: true,
        region_includes_end: true,
        max_num_results: 5
      }
    })
    if (!res.results || res.results.length < 0) {
      window.showMessage('TabNine::config_dir return empty result', 'error')
      return
    }
    let folder = res.results[0].new_prefix
    let file = path.join(folder, 'tabnine_config.json')
    await workspace.openResource(Uri.file(file).toString())
  }))

  subscriptions.push(languages.registerCompletionItemProvider('tabnine', configuration.get<string>('shortcut', 'TN'), null, {
    async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): Promise<CompletionList | undefined | null> {
      if (disable_filetypes.indexOf(document.languageId) !== -1) return null
      let { option } = context as any
      try {
        const offset = document.offsetAt(position)
        const before_start_offset = Math.max(0, offset - CHAR_LIMIT)
        const after_end_offset = offset + CHAR_LIMIT
        const before_start = document.positionAt(before_start_offset)
        const after_end = document.positionAt(after_end_offset)
        const before = document.getText(Range.create(before_start, position))
        const after = document.getText(Range.create(position, after_end))
        const request = tabNine.request("2.0.0", {
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
        let completionList: CompletionList
        if (response.results.length === 0) {
          completionList = { items: [], isIncomplete: false }
        } else {
          const results: CompletionItem[] = []
          let detailMessage = ""
          for (const msg of response.user_message) {
            if (detailMessage !== "") {
              detailMessage += "\n"
            }
            detailMessage += msg
          }
          let index = 0
          let hasPreselect = false
          for (const entry of response.results) {
            let item = makeCompletionItem({
              document,
              index,
              position,
              detailMessage,
              hasPreselect,
              old_prefix: response.old_prefix,
              entry,
            })
            if (item.preselect) {
              hasPreselect = true
            }
            results.push(item)
            index += 1
          }
          completionList = { items: results.slice(0, limit), isIncomplete: option.input.length <= 3 }
        }
        return completionList
      } catch (e) {
        // tslint:disable-next-line: no-console
        console.log(`Error setting up request: ${e}`)
      }
    }
  }, [], priority))

  function makeCompletionItem(args: {
    document: TextDocument,
    index: number,
    position: Position,
    detailMessage: string,
    old_prefix: string,
    entry: ResultEntry,
    hasPreselect: boolean
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
    item.detail = args.entry.detail ? args.entry.detail : args.detailMessage
    let detail = item.detail || ''
    if (detail == DEFAULT_DETAIL || [
      'Buy a license',
      'Deep TabNine',
      'TabNine Cloud',
      'TabNine::sem',
    ].some(str => detail.includes(str))) {
      delete item.detail
    }
    if (item.detail == null && item.insertTextFormat != InsertTextFormat.Snippet) {
      item.data = item.data || {}
      item.data.dup = 0
    } else if (args.index == 0 && item.insertTextFormat == InsertTextFormat.Snippet) {
      item.preselect = true
    }
    if (args.entry.kind) {
      item.kind = args.entry.kind
    } else if (item.insertTextFormat == InsertTextFormat.Snippet) {
      item.kind = CompletionItemKind.Snippet
    }
    let pre = args.document.getText(Range.create(args.position.line, 0, args.position.line, args.position.character))
    if (pre.indexOf('TabNine::') !== -1) {
      item.filterText = pre
    }
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
    let line: string
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
  private childDead: boolean
  private binaryPath?: string
  private mutex: Mutex = new Mutex()
  private numRestarts = 0
  private proc: child_process.ChildProcess
  private rl: readline.ReadLine
  private storagePath: string

  constructor(storagePath: string, binaryPath?: string) {
    this.storagePath = storagePath
    this.binaryPath = binaryPath
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
      "--client=coc.nvim",
    ]

    const binaryPath = this.binaryPath || TabNine.getBinaryPath(path.join(this.storagePath, "binaries"))

    this.proc = child_process.spawn(binaryPath, args)
    this.childDead = false
    this.proc.on('exit', () => {
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

  // install if not exists
  public static async installTabNine(root: string): Promise<void> {
    if (!fs.existsSync(root)) {
      mkdirp.sync(root)
    }

    try {
      const path = TabNine.getBinaryPath(root)
      if (path) return
    } catch (e) {
      // noop
    }

    const version = (await fetch('https://update.tabnine.com/version')).toString().trim()
    const archAndPlatform = TabNine.getArchAndPlatform()
    const url = `https://update.tabnine.com/${version}/${archAndPlatform}`
    const item = window.createStatusBarItem(0, { progress: true })

    item.text = 'Downloading TabNine'
    item.show()

    try {
      const dest = path.join(root, `${version}/${archAndPlatform}`)
      await download(url, dest, percent => {
        item.text = `Downloading TabNine ${(percent * 100).toFixed(0)}%`
      })
      fs.chmodSync(dest, 0o755)
    } catch (e) {
      window.showMessage(`Download error ${e.message}`, 'error')
    }
    item.dispose()
  }

  private static getBinaryPath(root: string): string {
    const archAndPlatform = TabNine.getArchAndPlatform()
    const versions = fs.readdirSync(root)

    if (!versions || versions.length == 0) {
      throw new Error('TabNine not installed')
    }

    const sortedVersions = TabNine.sortBySemver(versions)

    const tried = []
    for (const version of sortedVersions) {
      const fullPath = `${root}/${version}/${archAndPlatform}`

      if (fs.existsSync(fullPath)) {
        return fullPath
      } else {
        tried.push(fullPath)
      }
    }
    throw new Error(`Couldn't find a TabNine binary (tried the following paths: versions=${sortedVersions} ${tried})`)
  }

  private static getArchAndPlatform(): string {
    let arch: string
    switch (process.arch) {
      case 'x32':
        arch = 'i686'
        break
      case 'x64':
        arch = 'x86_64'
        break
      default:
        throw new Error(`Sorry, the architecture '${process.arch}' is not supported by TabNine.`)
    }

    let suffix: string
    switch (process.platform) {
      case 'win32':
        suffix = 'pc-windows-gnu/TabNine.exe'
        break
      case 'darwin':
        suffix = 'apple-darwin/TabNine'
        break
      case 'linux':
        suffix = 'unknown-linux-musl/TabNine'
        break
      default:
        throw new Error(`Sorry, the platform '${process.platform}' is not supported by TabNine.`)
    }

    return `${arch}-${suffix}`
  }

  private static sortBySemver(versions: string[]): string[] {
    return versions.sort(TabNine.cmpSemver)
  }

  private static cmpSemver(a: string, b: string): number {
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
