/** @babel */
/* global atom require */ // eslint-disable-line

import { Point, Range } from 'atom'

// Use atom's built in tree sitter
const Parser = require(atom.menu.resourcePath + '/node_modules/tree-sitter')

class Template {
  constructor (content, tabs, editor) {
    this.content = content
    this.__editor  = editor

    if (tabs instanceof Point)
      this.__cursor = tabs
    else if (tabs instanceof Range)
      this.__range = tabs
    else if (Array.isArray(tabs))
      this.__tabs  = tabs
    else
      throw new Error("Expected Array, Point or Range")
  }

  getNextTabRange (point) {
    if (!this.__tabs)
      return null

    point = Point.fromObject(point)

    const toRange = (tab) => {
      const lineText = this.__editor.lineTextForBufferRow(tab.row)
      if (lineText) {
        const range = Range.fromObject([
          [tab.row, lineText.length + tab.negStart],
          [tab.row, lineText.length + tab.negEnd]
        ])
        const rangeText = lineText.substring(range.start.column, range.end.column)
        return rangeText === tab.value && range
      }
    }

    var first = null
    for (var i = 0; i < this.__tabs.length; i++) {
      const tabEntry = this.__tabs[i]
      if (tabEntry) {
        const tabRange = toRange(tabEntry)

        if (tabRange) {
          first = first || tabRange
          if (point.isLessThan(tabRange.start))
            return tabRange
        } else {
          delete this.__tabs[i]
        }
      }
    }

    return first
  }

  getCursorPosition () {
    return this.__cursor
  }

  getSelectionRange () {
    return this.__range
  }
}

export class Builder {
  constructor (debug) {
    this.debug = debug
  }

  createTemplate (cursorPosition, editor, range) {
    this.__editor = editor;

    const match = this.parseLine(cursorPosition, range)
    if (!match)
      return false

    return this[match.method](cursorPosition, match.template)
  }

  /* Protected methods */

  createDocBlock (cursorPosition, template) {
    const node = this.parseCode(cursorPosition.row + 1)

    return node && this.generateTemplate(node, cursorPosition.row, template);
  }

  createGeneric (cursorPosition, template) {
    return this.generateTemplate(null, cursorPosition.row, template);
  }

  createInline (cursorPosition, template) {
    return this.generateTemplate(null, cursorPosition.row, template);
  }

  removeInline (cursorPosition, template) {
    return this.generateTemplate(null, cursorPosition.row, template);
  }

  createContinuation (cursorPosition, template) {
    return this.generateTemplate(null, cursorPosition.row, template);
  }

  readLine (row) {
    if (!this.__editor)
      return null

    return this.__editor.lineTextForBufferRow(row)
  }

  getCodeBlock (row) {
    if (!this.__editor)
      return null

    const charIterator = () => {
      let nextIndex = 0
      let currLine  = null
      let read = []

      const nextLine = () => {
        if (null != (currLine = this.readLine(row))) {
          row++
          nextIndex = 0
          currLine += '\n'
        }
        return currLine
      }

      return {
        next: () => {
          if ((currLine && nextIndex < currLine.length) || nextLine()) {
            read.push(currLine[nextIndex])
            return { value: currLine[nextIndex++], done: false }
          }

          return { value: null, done: true }
        },
        result: () => {
          return read.slice(0, -1).join("")
        }
      }
    }

    const chars = charIterator()
    const seekToClosingChar = (char) => {
      for (var iter = chars.next(); !iter.done; iter = chars.next()) {
        switch (iter.value) {
          case char: return
          case '(': seekToClosingChar(')'); break
          case '{': seekToClosingChar('}'); break
          case '[': seekToClosingChar(']'); break
        }
      }
    }

    var type = null
    for (var iter = chars.next(); !iter.done && !type; iter = chars.next()) {
      switch (iter.value) {
        case '(':
          type = "function"
          seekToClosingChar(')')
          break
        case '{':
          type = "object"
          seekToClosingChar('}')
          seekToClosingChar(';')
          break
        case ';':
          type = "variable"
          break
        case '[':
          seekToClosingChar(']')
          break
      }
    }

    return chars.result()
  }

  getTree (row) {
    if (!(this.__editor && this.__editor.languageMode && this.__editor.languageMode.tree))
      return null

    const code = this.getCodeBlock(row)
    const grammar = this.__editor.languageMode.getGrammar()
    const parser = new Parser();

    if (!code)
      return null

    this.log(code)
    parser.setLanguage(grammar.languageModule);

    const result = parser.parse(code)

    return result && result.rootNode
  }

  parseLine (cursor, range) {
    const line = this.readLine(cursor.row)
    const pre = line.substring(0, cursor.column)
    const aft = line.substring(cursor.column)
    // return the name of a function and any args to pass to that function

    var match
    for (const expr of this.getExpressions()) {
      if (match = expr.call(this, {line, pre, aft, cursor, range})) {
        return match
      }
    }
  }

  // eslint-disable-next-line
  parseCode (row) {
    throw new Error(`${arguments.callee.name}() not implemented`)
  }

  generateTemplate (node, lineNum, prototype) {
    // TODO - allow users to define template function

    const tabs = []
    const lines = []
    const prefix = prototype.body && prototype.body.length
    const Tab = (str) => `{{__tab_start__}}${str}{{__tab_end__}}`
    const Align = (num) => " ".repeat(num) //`{{__align__}}${" ".repeat(num)}{{__align__}}`
    const Line = (...segments) => {
      var lineText = segments.filter(s => s).join("")
      var LineTabs = []
      var offsetAdjust = 0

      // lineText = lineText.replace(/{{__align__}}(\s*){{__align__}}/, '$2')

      lineText = prototype.body + lineText.replace(/{{__tab_start__}}(.*?){{__tab_end__}}/g, (match, str, offset) => {
        LineTabs.push({
          start: prefix + offset - offsetAdjust,
          end: prefix + offset + str.length - offsetAdjust,
          value: str
        })
        offsetAdjust += "{{__tab_start__}}{{__tab_end__}}".length
        return str
      })

      tabs.push(...LineTabs.map(tab => {
        return {
          row: lineNum,
          negStart: tab.start - lineText.length,
          negEnd: tab.end - lineText.length,
          value: tab.value
        }
      }))
      lines.push(lineText)

      lineNum++
      return true
    }

    if (prototype.head) {
      lineNum++
      lines.push(prototype.head)
    }

    if (node) {
      this.defaultTemplate(node, {Line, Tab, Align})
    } else if (Array.isArray(prototype.body)) {
      return new Template(prototype.body, prototype.range)
    } else {
      lines.push(prototype.body)
    }

    if (prototype.tail)
      lines.push(prototype.tail)

    return new Template(lines.join("\n"), tabs.length ? tabs : prototype.cursor, this.__editor)
  }

  isNextLineContinuation (row) {
    const line = this.readLine(row + 1)
    return line && line.match(/^\s*\*/)
  }


  existingTest ({cursor, range}) {
    // This method should only handle the 'Shift + Enter' calls
    if (!range)
      return

    // Expand range to include all comment under curor regardless of actual selection
    range = this.__editor.bufferRangeForScopeAtPosition("comment", cursor)
    if (range) {
      const first = this.readLine(range.start.row)

      if (range.isSingleLine()) {
        const head = first.substring(0, range.start.column)
        const body = first.substring(range.start.column, range.end.column)
        const tail = first.substring(range.end.column)
        const match = body.match(/^\/\*(.*)\*\/$/)
        if (match) {
          return {
            method: "removeInline",
            template: {
              body: [ head + match[1] + tail ],
              range: Range.fromObject([
                [range.start.row, range.start.column],
                [range.end.row, range.end.column - 4]
              ])
            }
          }
        }
      } else {
        const last = this.readLine(range.end.row)
        const head_pre = first.substring(0, range.start.column)
        const head_aft = first.substring(range.start.column)
        const tail_pre = last.substring(0, range.end.column)
        const tail_aft = last.substring(range.end.column)

        const head_aft_match = head_aft.match(/^\/\*(.*)$/)
        const tail_pre_match = tail_pre.match(/^(.*)\*\//)

        if (head_aft_match && tail_pre_match) {
          // Each non null entry indicates a line to replace
          // It's up to the user to remove resulting empty lines
          const body = [ head_pre + head_aft_match[1] ]
          body[ range.end.row - range.start.row ] = tail_pre_match[1] + tail_aft

          return {
            method: "removeInline",
            template: {
              body,
              range: Range.fromObject([
                [range.start.row, range.start.column - 2],
                [range.end.row, range.end.column]
              ])
            }
          }
        }
      }
    }
  }

  inlineTest ({range}) {
    if (range) {
      const first = this.readLine(range.start.row)

      if (range.isSingleLine()) {
        const head = first.substring(0, range.start.column)
        const body = first.substring(range.start.column, range.end.column)
        const tail = first.substring(range.end.column)

        return {
          method: "createInline",
          template: {
            body: [ head + "/*" + body + "*/" + tail ],
            range: Range.fromObject([
              [range.start.row, range.start.column + 2],
              [range.end.row, range.end.column + 2]
            ])
          }
        }
      } else {
        const last = this.readLine(range.end.row)
        const head_pre = first.substring(0, range.start.column)
        const head_aft = first.substring(range.start.column)
        const tail_pre = last.substring(0, range.end.column)
        const tail_aft = last.substring(range.end.column)

        // Each non null entry indicates a line to replace
        const body = [ head_pre + "/*" + head_aft ]
        body[ range.end.row - range.start.row ] = tail_pre + "*/" + tail_aft

        return {
          method: "createInline",
          template: {
            body,
            range: Range.fromObject([
              [range.start.row, range.start.column + 2],
              [range.end.row, range.end.column + 0]
            ])
          }
        }
      }
    }
  }

  singleLineTest ({pre, aft, cursor}) {
    const match = pre.match(/^(\s*)\/\/.*$/)

    return match && {
      method: "createContinuation",
      template: {
        head: pre,
        body: match[1] + "// " + aft,
        cursor: Point.fromObject([cursor.row + 1, match[1].length + 3])
      }
    }
  }

  docBlockTest ({pre, aft, cursor}) {
    const match = pre.match(/^(\s*)\/\*\*$/)

    if (match && aft.match(/^\s*$/) && !this.isNextLineContinuation(cursor.row)) {
      return {
        method: "createDocBlock",
        template: {
          head: match[1] + "/**",
          body: match[1] + " * ",
          tail: match[1] + " */",
          cursor: Point.fromObject([cursor.row + 1, match[1].length + 3])
        }
      }
    }
  }

  singleToMultiTest ({pre, aft, cursor}) {
    const matchPre = pre.match(/^(\s*)\/\*(.*)$/)
    const matchAft = aft.match(/^(.*?)(?:\*\/)?\s*$/)

    if (matchPre && matchAft && !this.isNextLineContinuation(cursor.row)) {
      return {
        method: "createGeneric",
        template: {
          head: matchPre[1] + "/*" + matchPre[2],
          body: matchPre[1] + " * " + matchAft[1],
          tail: matchPre[1] + " */",
          cursor: Point.fromObject([cursor.row + 1, matchPre[1].length + 3])
        }
      }
    }
  }

  continuationTest ({pre, aft, cursor}) {
    const match = pre.match(/^(\s*)(?:\/|\s\*)/)

    if (match && this.isNextLineContinuation(cursor.row)) {
      return {
        method: "createContinuation",
        template: {
          head: pre,
          body: match[1] + " * " + aft,
          cursor: Point.fromObject([cursor.row + 1, match[1].length + 3])
        }
      }
    }
  }

  getExpressions () {
    return [
      this.existingTest,
      this.inlineTest,
      this.singleLineTest,
      this.docBlockTest,
      this.singleToMultiTest,
      this.continuationTest
    ]
  }

  defaultTemplate () {
    throw new Error(`${arguments.callee.name}() not implemented`)
  }

  log (...args) {
    if (this.debug)
      console.log(...args) // eslint-disable-line
  }
}
