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

- `tabnine.openConfig`: open config file of tabnine.

_Note_: to make coc.nvim works better with TabNine, add `"ignore_all_lsp": true` to config file of tabnine.

## Configuration

Use command `:CocConfig` to open user configuration file of coc.nvim.

- _"tabnine.shortcut"_: Shortcut for tabnine source., default: `"TN"`
- _"tabnine.triggers"_: Trigger characters of TabNine source, default: `[]`
- _"tabnine.priority"_: Priority of tabnine source., default: `100`
- _"tabnine.binary_path"_: Use binary at specific path., default: `""`
- _"tabnine.disable_filetypes"_: Disable TabNine for configured filetypes., default: `[]`
- _"tabnine.disable_file_regex"_: Disable TabNine when the file path contains a match of any of the provided regexes. For example, add "[.]js\$" to disable TabNine in JavaScript files., default: `[]`
- _"tabnine.disable_line_regex"_: Disable TabNine when the current line contains a match of any of the provided regexes. For example, add "require" to disable TabNine when the current line contains the word 'require'., default: `[]`

## License

MIT
