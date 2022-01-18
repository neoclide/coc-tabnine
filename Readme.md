# coc-tabnine

Fork of [tabnine-vscode](https://github.com/zxqfl/tabnine-vscode)

This is the [coc.nvim](https://github.com/neoclide/coc.nvim) client for [Tabnine](https://tabnine.com), the all-language autocompleter.

- Indexes your whole project, reading your .gitignore to determine which files to index.
- Type long variable names in just a few keystrokes using the mnemonic completion engine.
- Zero configuration. Tabnine works out of the box.
- Highly responsive: typically produces a list of suggestions in less than 10 milliseconds.

## Install

In your vim/neovim, run command:

```
:CocInstall coc-tabnine
```

## Commands

Run `:CocCommand` to open commands list.

- `tabnine.openConfig`: open config file of Tabnine.

- `tabnine.openHub`: open Tabnine hub.

_Note_: to make coc.nvim works better with Tabnine, add `"ignore_all_lsp": true` to config file of Tabnine.

## Configuration

Use command `:CocConfig` to open user configuration file of coc.nvim.

| Option                       | Description                                                                                                                                                                               | Default value |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------: |
| `tabnine.shortcut`           | Shortcut for Tabnine source.                                                                                                                                                              |    `"TN"`     |
| `tabnine.triggers`           | Trigger characters of Tabnine source.                                                                                                                                                     |     `[]`      |
| `tabnine.priority`           | Priority of Tabnine source                                                                                                                                                                |      999      |
| `tabnine.binary_path`        | Use binary at specific path.                                                                                                                                                              |     `""`      |
| `tabnine.disable_filetypes`  | Disable Tabnine for configured filetypes.                                                                                                                                                 |     `[]`      |
| `tabnine.disable_file_regex` | Disable Tabnine when the file path contains a match of any of the provided regexes. For example, add `"[.]js\$"` to disable Tabnine in JavaScript files.                                  |     `[]`      |
| `tabnine.disable_line_regex` | Disable Tabnine when the current line contains a match of any of the provided regexes. For example, add `"require"` to disable Tabnine when the current line contains the word `require`. |     `[]`      |

## Magic Strings

Configure Tabnine itself by inputting a `special_commands` string\_ like `Tabnine::config` or `Tabnine::restart` in any buffer and trigger autocomplete. A full list of available `special_commands` is available here: https://www.tabnine.com/faq#special_commands

### API Key

This library does not configure Tabnine's Pro API key, if you've purchased a subscription license. To configure, you'll need to use the `Tabnine::config` magic string to update your preferences.

> _Note: An API key is not required to use [`coc-tabnine`](#coc-tabine)._

## License

MIT
