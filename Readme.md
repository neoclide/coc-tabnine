# coc-tabnine

Fork of [tabnine-vscode](https://github.com/zxqfl/tabnine-vscode)

This is the [coc.nvim](https://github.com/neoclide/coc.nvim) client for [TabNine](https://tabnine.com), the all-language autocompleter.

- Indexes your whole project, reading your .gitignore to determine which files to index.
- Type long variable names in just a few keystrokes using the mnemonic completion engine.
- Zero configuration. TabNine works out of the box.
- Highly responsive: typically produces a list of suggestions in less than 10 milliseconds.

## Install

In your vim/neovim, run command:

```
:CocInstall coc-tabnine
```

## Commands

Run `:CocCommand` to open commands list.

- `tabnine.openConfig`: open config file of TabNine.

_Note_: to make coc.nvim works better with TabNine, add `"ignore_all_lsp": true` to config file of TabNine.

## Configuration

Use command `:CocConfig` to open user configuration file of coc.nvim.

| Option                       | Description                                                                                                                                                                               | Default value |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------: |
| `tabnine.shortcut`           | Shortcut for TabNine source.                                                                                                                                                              |    `"TN"`     |
| `tabnine.triggers`           | Trigger characters of TabNine source.                                                                                                                                                     |     `[]`      |
| `tabnine.priority`           | Priority of TabNine source.                                                                                                                                                               |     `100`     |
| `tabnine.binary_path`        | Use binary at specific path.                                                                                                                                                              |     `""`      |
| `tabnine.disable_filetypes`  | Disable TabNine for configured filetypes.                                                                                                                                                 |     `[]`      |
| `tabnine.disable_file_regex` | Disable TabNine when the file path contains a match of any of the provided regexes. For example, add `"[.]js\$"` to disable TabNine in JavaScript files.                                  |     `[]`      |
| `tabnine.disable_line_regex` | Disable TabNine when the current line contains a match of any of the provided regexes. For example, add `"require"` to disable TabNine when the current line contains the word `require`. |     `[]`      |

## Magic Strings

Configure TabNine itself by inputting a _magic string_ like `TabNine::config` or `TabNine::restart` in any buffer and trigger autocomplete. A full list of available _magic strings_ is available here: https://tabnine.com/faq/#magic_strings.

## License

MIT
