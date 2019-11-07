/** @babel */
/* global atom console require __dirname */ // eslint-disable-line

import { CompositeDisposable } from 'atom'

export class Manager {
  constructor () {
    this.__builders = []
    this.debug = true
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(atom.workspace.getCenter().observeActivePaneItem(paneItem => {
      this.editor = atom.workspace.isTextEditor(paneItem) ? paneItem : null
    }))
  }

  destroy () {
    this.subscriptions.dispose()
    this.editor = null
  }

  getBuilder () {
    if (!this.editor)
      return

    const language = this.editor.getGrammar().name

    if (this.__builders[language] == null) {
      try {
        const Builder = require(`${__dirname}/languages/${language.replace(/ /g, '-').toLowerCase()}.es6`)

        if (Builder) {
          this.log(`Loaded builder for "${language}"`)
        } else {
          this.log(`Builder for "${language}" is not available!`)
        }

        this.__builders[language] = new Builder(this.debug)
      } catch (_) {
        this.log(`Error while loading builder for "${language}"!`)
        this.log(_)
        this.__builders[language] = false
      }
    }

    return this.__builders[language]
  }

  onTab () {
    if (!this.__activeTemplate)
      return false

    const cursors = this.editor.getCursors()
    const position = cursors[0].getBufferPosition()
    var tab

    if (this.__activeTemplate.range.containsPoint(position)) {
      if (tab = this.__activeTemplate.getNextTabRange(position)) {
        this.editor.setSelectedBufferRange(tab, {
          reversed: true
        })

        return true
      }
    }

    this.__activeTemplate = null

    return false
  }

  onEnter () {
    const builder = this.getBuilder()
    if (!builder)
      return false

    const cursors = this.editor.getCursors()
    const position = cursors[0].getBufferPosition()
    const template = builder.createTemplate(position, this.editor)
    var tab, range, point

    this.__activeTemplate = null

    if (template) {
      console.log(template);
      range = this.editor.getBuffer().rangeForRow(position.row)
      template.range = this.editor.setTextInBufferRange(range, template.content, {
        normalizeLineEndings: true
      })

      if (tab = template.getNextTabRange(position)) {
        this.editor.setSelectedBufferRange(tab, {
          reversed: true
        })

        // Store the template for tab handling
        this.__activeTemplate = template
      } else if (point = template.getCursorPosition()) {
        cursors[0].setBufferPosition(point)
      }

      return true
    }

    return false
  }

  onInline () {
    const builder = this.getBuilder()
    if (!builder)
      return false

    const selections = this.editor.getSelectionsOrderedByBufferPosition()

    for (let c = selections.length - 1; c >= 0; --c) {
      // if (selections[c].isEmpty())
      //   continue

      const oldRange = selections[c].getBufferRange()
      const position = selections[c].isReversed() ? oldRange.start : oldRange.end
      const template = builder.createTemplate(position, this.editor, oldRange)
      var newRange

      if (template) {
        const check = this.editor.createCheckpoint()
        const adjustRange = oldRange.isEmpty() ? template.getSelectionRange() : oldRange

        for (var offset = 0; offset < template.content.length; offset++) {
          if (template.content[offset] != null) {
            const rowRange = this.editor.getBuffer().rangeForRow(adjustRange.start.row + offset)

            // console.log(template, rowRange, `"${template.content[offset]}"`);

            this.editor.setTextInBufferRange(rowRange, template.content[offset], {
              normalizeLineEndings: false
            })
          }
        }

        if (newRange = template.getSelectionRange())
          selections[c].setBufferRange(newRange)

        this.editor.groupChangesSinceCheckpoint(check)

        return true
      }

      return false
    }
  }

  log (...args) {
    if (this.debug)
      console.log(...args)
  }
}
