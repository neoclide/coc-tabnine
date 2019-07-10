# coc-tabnine

Fork of [tabnine-vscode](https://github.com/zxqfl/tabnine-vscode)

This is the [coc.nvim](https://github.com/neoclide/coc.nvim) client for [TabNine](https://tabnine.com), the all-language autocompleter.

- Indexes your whole project, reading your .gitignore to determine which files to index.
- Type long variable names in just a few keystrokes using the mnemonic completion engine.
- Zero configuration. TabNine works out of the box.
- Highly responsive: typically produces a list of suggestions in less than 10 milliseconds.

Many users choose to disable the default behavior of using Enter to accept completions, to avoid accepting a completion when they intended to start a new line. You can do this by going to _Settings → Editor: Accept Suggestion On Enter_ and setting it to _off_.

A note on licensing: this repo includes source code as well as packaged TabNine binaries. The MIT license only applies to the source code, not the binaries. The binaries are covered by the [TabNine End User License Agreement](https://tabnine.com/eula).

## Install

In your vim/neovim, run command:

```
:CocInstall coc-tabnine
```

## Configuration

Use command `:CocConfig` to open user configuration file of coc.nvim.

- "tabnine.shortcut":~

      	shortcut  for tabnine source.,  default: `"TN"`

- "tabnine.priority":~

      	Priority of tabnine source.,  default: `100`

- "tabnine.disable_filetyps":~

      	Disable TabNine with configured filetypes.,  default: `[]`

- "tabnine.disable_line_regex":~

      	Disable TabNine when the current line contains a match of any of the provided regexes. For example, add "require" to disable TabNine when the current line contains the word 'require'.,  default: `[]`

- "tabnine.disable_file_regex":~

      	Disable TabNine when the file path contains a match of any of the provided regexes. For example, add "[.]js$" to disable TabNine in JavaScript files.,  default: `[]`

## License

MIT
