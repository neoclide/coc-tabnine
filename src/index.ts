import { CancellationToken, commands, CompletionContext, CompletionItem, CompletionItemKind, CompletionList, ExtensionContext, InsertTextFormat, languages, MarkupContent, Position, Range, TextDocument, TextEdit, Uri, window, workspace } from 'coc.nvim'
import fs from 'fs'
import path from 'path'
import { TabNine } from './tabnine'

const CHAR_LIMIT = 100000
const MAX_NUM_RESULTS = 5
const DEFAULT_DETAIL = "TabNine"

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

export async function activate(context: ExtensionContext): Promise<void> {
  const configuration = workspace.getConfiguration('tabnine')
  const { subscriptions, logger } = context

  const binaryPath = configuration.get<string>('binary_path', undefined)
  const disable_filetypes = configuration.get<string[]>('disable_filetypes', [])
  const filetypes = configuration.get<string[] | null>('filetypes', null)
  const limit = configuration.get<number>('limit', 10)
  const priority = configuration.get<number>('priority', undefined)

  const tabNine = new TabNine(context.storagePath, binaryPath)
  if (!binaryPath) {
    const root = path.join(context.storagePath, 'binaries')
    let binaryPath: string
    try {
      binaryPath = TabNine.getBinaryPath(root)
    } catch (e) {
      logger.error(e.message)
    }
    if (fs.existsSync(binaryPath)) {
      logger.info(`Using tabnine from ${binaryPath}`)
    } else {
      await TabNine.installTabNine(root)
    }
  } else {
    if (!fs.existsSync(binaryPath)) {
      throw new Error('Specified path to TabNine binary not found. ' + binaryPath)
    }
  }

  subscriptions.push(commands.registerCommand('tabnine.updateTabNine', async () => {
    if (binaryPath) {
      window.showMessage(`Cant't update user defined tabnine: ${binaryPath}`)
      return
    }
    const root = path.join(context.storagePath, 'binaries')
    await TabNine.updateTabNine(root)
    window.showMessage('Restart coc.nvim by :CocRestart to use latest TabNine.')
  }))

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

  subscriptions.push(commands.registerCommand('tabnine.openHub', async () => {
    await tabNine.request("2.0.0", { Configuration: {} })
  }))

  subscriptions.push(languages.registerCompletionItemProvider('tabnine',
    configuration.get<string>('shortcut', 'TN'),
    filetypes, {
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
        if (token.isCancellationRequested) {
          return undefined
        }
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
          if (!hasPreselect && results.length && configuration.get<boolean>('enablePreselect', true)) {
            results[0].preselect = true
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
          kind: 'markdown',
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
