# commentator package

A source code comment plug-in for the atom editor.

## Installing

Run `apm install commentator` or search for the `commentator` plug-in from within Atom's settings.

## Supported Languages

Currently only the C language is supported with default docBlocks tailored for Linux kernel development.

## Usage

In the editor type `/**` then press `Enter`. If the string is immediately preceding a declaration or function, a docBlock style comment will be generated with tab-able content.

Enter `/*` and `Enter` to generate a normal multi-line comment.
Press `Shift + Enter` to quickly create a comment block.  
Highlight text and press `Shift + Enter` to wrap.  
Place cursor anywhere inside a `/* */` block and press `Shift + Enter` to unwrap.  
Pressing `Enter` within an existing comment will continue that comment onto the next line.

## Customize

Don't like the style of of the generated docBlock? Then use your own template.

For the `c` language, create the file `~/.atom/commentator/c.js` (any file format importable by `require` is supported). OR, for project specific templates, add the following to `package.json` in the projects root directory:
```json
{
  "commentator": {
    "c": "/path/to/template.js"
  }
}
```
The file must export a single function:
```js
/** @babel */

export default function (node, {Line, Tab, Align}) {
    Line("A single line: ", node.name, Align(3), Tab('[tabbable selection]'))
}
```
Where:
* variable `node`  
  Parsed code object (see `lib/node.es6` for details)
* function `Align`  
  Creates a string of spaces. Use `node.maxNameLength` and `node.name.length` to calculate spaces required.
* function `Tab`  
  Converts given string into tabbable content (pressing tab while cursor is inside the docBlock will select the text).
* function `Line`  
  Takes any number of arguments and converts them into a string. Each call will add a new line to the rendered output.

The `Tab` and `Align` functions return strings making them safe to use in string interpolation. You **do not** need to wrap the template in `/**` and `*/`, or account for leading tab/space characters.

## Limitations

Currently, the underlying parser for the 'c' grammar doesn't handle attributes very well. A workaround is to temporarily remove the attribute, generate the docBlock then replace. This is not something that can be fixed within this module.

## Development

The backend uses atoms `tree-sitter` package to generate AST nodes, though you do not need to have Tree Sitter Parsers enabled. Adding support for new languages should be relatively simple provided said language has a TS grammar.
