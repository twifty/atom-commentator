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

  destroy () {
    if (this.tabLayer) {
      this.tabLayer.clear()
      this.tabLayer.destroy()
      this.tabLayer = null
    }
  }

  getNextTabRange (point) {
    if (!this.__tabs)
      return null

    if (!this.tabLayer) {
      this.tabLayer = this.__editor.addMarkerLayer()

      for (var i = 0; i < this.__tabs.length; i++) {
        const tab = this.__tabs[i]

        this.tabLayer.markBufferRange([[tab.row, tab.start], [tab.row, tab.end]], {invalidate: 'inside'})
      }

      // this.__editor.decorateMarkerLayer(this.tabLayer, {type: 'highlight', class: 'covered', onlyNonEmpty: true})
    }

    var first = null
    for (const marker of this.tabLayer.getMarkers()) {
      if (!marker.isValid())
        continue

      const range = marker.getBufferRange();
      first = first || range

      // console.log(range);

      if (point.isLessThan(range.start))
        return range
    }

    return first

    // point = Point.fromObject(point)
    //
    // const toRange = (tab) => {
    //   const lineText = this.__editor.lineTextForBufferRow(tab.row)
    //   if (lineText) {
    //     const range = Range.fromObject([
    //       [tab.row, lineText.length + tab.negStart],
    //       [tab.row, lineText.length + tab.negEnd]
    //     ])
    //     const rangeText = lineText.substring(range.start.column, range.end.column)
    //     return rangeText === tab.value && range
    //   }
    // }
    //
    // var first = null
    // for (var i = 0; i < this.__tabs.length; i++) {
    //   const tabEntry = this.__tabs[i]
    //   if (tabEntry) {
    //     const tabRange = toRange(tabEntry)
    //
    //     if (tabRange) {
    //       first = first || tabRange
    //       if (point.isLessThan(tabRange.start))
    //         return tabRange
    //     } else {
    //       delete this.__tabs[i]
    //     }
    //   }
    // }
    //
    // return first
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

    this.log(node)

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

  readLineEnd (row) {
    if (!this.__editor)
      return null

    return this.__editor.getBuffer().lineEndingForRow(row)
  }

  getCharIterator (row) {
    if (!this.__editor)
      return null

    var nextIndex = 0
    var currLine  = null
    var read = []

    const nextLine = () => {
      if (null != (currLine = this.readLine(row))) {
        currLine += this.readLineEnd(row)
        row++
        nextIndex = 0
      }
      return currLine
    }

    const iter = {
      blocks: {
        '(': ['seekToBlockEnd', ')'],
        '{': ['seekToBlockEnd', '}'],
        '[': ['seekToBlockEnd', ']'],
        "'": ['seekToStringEnd', "'", '\\'],
        '"': ['seekToStringEnd', '"', '\\'],
      },
      value: null,
      done: true,
      next: () => {
        if ((currLine && nextIndex < currLine.length) || nextLine()) {
          read.push(currLine[nextIndex])
          iter.value = currLine[nextIndex++]
          iter.done = false
        } else {
          iter.value = null
          iter.done = true
        }

        return iter
      },
      seekToBlockEnd (char) {
        for (iter.next(); !iter.done; iter.next()) {
          if (iter.value === char)
            return true

          if (iter.value in this.blocks) {
            const args = this.blocks[iter.value]
            if (!this[args[0]].apply(this, args.slice(1)))
              return false
          }
        }

        return false
      },
      seekToStringEnd (char, esc) {
        var isEscaped = false

        for (iter.next(); !iter.done; iter.next()) {
          switch (iter.value) {
            case esc:
              isEscaped = !isEscaped
              break
            case char:
              if (!isEscaped)
                return true
              // Fall through
            default:
              isEscaped = false
              break
          }
        }

        return false
      },
      get result () {
        return read.join("")
      }
    }

    return iter
  }

  // eslint-disable-next-line
  getCodeBlock (iter) {
    throw new Error(`${arguments.callee.name}() not implemented`)
  }

  getTree (row) {
    /*
      NOTE: Fetching the already parsed tree from the editor will fail because
      when the opening "/**" is on the preceeding line, the parser thinks all
      following lines are a comment.

      Also, building a tree by adding lines as they are required fails for three
      reasons. 1) Depending on the grammar the tree will create ERROR nodes,
      especially for unclosed braces. 2) There is no node.edit function available
      in javascript, meaning a stored node in a partially iterated tree cannot
      be updated correctly. 3) Due to node hierarchy, A tree iterator will have
      a difficult time knowing when and where to request a new line to be read.

      The best solution is to iterate each character from the starting row until
      a certain character is detected signalling the end of the code block. That
      whole range of characters can then be parsed just once. The tree parser
      will treat the given code as being in a 'global' scope. However, some
      languages may not allow such code in a global scope and the tree parser
      may still error. Those languages can override these methods in order to
      generate a parsable tree.
    */
    if (!(this.__editor && this.__editor.languageMode && this.__editor.languageMode.tree))
      return null

    const code = this.getCodeBlock(this.getCharIterator(row))
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
    const tabs = []
    const lines = []
    const prefix = prototype.body && prototype.body.length
    const Tab = (str) => `{{__tab_start__}}${str}{{__tab_end__}}`
    const Align = (num) => " ".repeat(num)
    const Line = (...segments) => {
      var lineText = segments.filter(s => s).join("")
      var LineTabs = []
      var offsetAdjust = 0

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
          start: tab.start,
          end: tab.end,
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
      const template = this.getTemplate()
      template(node, {Line, Tab, Align})
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
          this.log("existingTest::singleLine Passed")

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

          this.log("existingTest::multiLine Passed")

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

        this.log("inlineTest::singleLine Passed")

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

        this.log("inlineTest::multiLine Passed")

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

    if (match) {
        this.log("singleLineTest Passed")
        return {
          method: "createContinuation",
          template: {
            head: pre,
            body: match[1] + "// " + aft,
            cursor: Point.fromObject([cursor.row + 1, match[1].length + 3])
          }
        }
    }
  }

  docBlockTest ({pre, aft, cursor}) {
    const match = pre.match(/^(\s*)\/\*\*$/)

    if (match && aft.match(/^\s*$/) && !this.isNextLineContinuation(cursor.row)) {
      this.log("docBlockTest Passed")
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
    const matchClose = pre.match(/\*\//)

    if (matchPre && !matchClose && matchAft && !this.isNextLineContinuation(cursor.row)) {
      this.log(`singleToMultiTest Passed "${pre}", "${aft}"`)
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
      this.log("continuationTest Passed")
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

  getTemplate () {
    throw new Error(`${arguments.callee.name}() not implemented`)
  }

  log (...args) {
    if (this.debug)
      console.log(...args) // eslint-disable-line
  }
}
