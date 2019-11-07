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

## Development

The backend uses atoms `tree-sitter` package to generate AST nodes, though you do not need to have Tree Sitter Parsers enabled. Adding support for new languages should be relatively simple provided said language has a TS grammar.
