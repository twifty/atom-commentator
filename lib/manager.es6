/** @babel */
/* global atom console require __dirname */ // eslint-disable-line

import { CompositeDisposable, File } from 'atom'
import path from "path"

export class Manager {
  constructor () {
    this.__builders = []
    this.debug = false
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(atom.workspace.getCenter().observeActivePaneItem(paneItem => {
      this.editor = atom.workspace.isTextEditor(paneItem) ? paneItem : null
    }))
  }

  destroy () {
    this.subscriptions.dispose()
    this.editor = null

    if (this.__activeTemplate) {
      this.__activeTemplate.destroy()
      this.__activeTemplate = null
    }
  }

  getBuilder () {
    if (!this.editor)
      return

    const language = this.editor.getGrammar().name.replace(/ /g, '-').toLowerCase()
    const template = this.loadTemplate(language)
    const cacheKey = (template && template.path) || language

    if (this.__builders[cacheKey] == null) {
      try {
        const Builder = require(`${__dirname}/languages/${language}.es6`)
        this.log(`Loaded builder for "${language}"`)
        this.__builders[cacheKey] = new Builder({debug: this.debug, template: template && template.func})
      } catch (err) {
        this.log(`Error while loading builder for "${language}"!`)
        this.log(err)
        this.__builders[cacheKey] = false
      }
    }

    return this.__builders[cacheKey]
  }

  loadTemplate (language) {
    const result = {}
    const fetch = (file) => {
      try {
        result.func = require(file)
        if (result.func)
          result.path = path
        return result.func
      } catch (err) {
        const promise = (new File(file)).exists()
        promise.then((exists) => {
          if (exists)
            throw err
        })
      }
    }

    var template = null

    /* Load a template from package.json */
    const projectPath = atom.project.relativizePath(this.editor.getPath())[0]
    const config = fetch(path.join(projectPath, "package.json"))
    if (config && config.commentator && language in config.commentator) {
      if (path.isAbsolute(config.commentator[language]))
        template = fetch(config.commentator[language])
      else
        template = fetch(path.join(projectPath, config.commentator[language]))
    }

    /* Load a global template */
    if (!template) {
      const atomPath = atom.getUserInitScriptPath()
      template = fetch(path.join(path.dirname(atomPath), "commentator", language))
    }

    if (typeof result.func === "function")
      return result

    return false
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

    const selections = this.editor.getSelectionsOrderedByBufferPosition()
    if (selections.length != 1)
      return

    /*
      Selected text would normally be replaced with a newline. It needs
      removing before being scanned so that the builder can read the
      correct lines.
    */
    const check = this.editor.createCheckpoint()

    if (!selections[0].isEmpty()) {
      const range = selections[0].getBufferRange()
      this.editor.setTextInBufferRange(range, "")
    }

    if (this.__activeTemplate) {
      this.__activeTemplate.destroy()
      this.__activeTemplate = null
    }

    // const cursors = this.editor.getCursors()
    const cursor = selections[0].cursor
    const position = cursor.getBufferPosition()
    const template = builder.createTemplate(position, this.editor)
    var tab, range, point

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
        cursor.setBufferPosition(point)
      }

      this.editor.groupChangesSinceCheckpoint(check)

      return true
    }

    this.editor.revertToCheckpoint(check)

    return false
  }

  onInline () {
    const builder = this.getBuilder()
    if (!builder)
      return false

    const selections = this.editor.getSelectionsOrderedByBufferPosition()

    for (let c = selections.length - 1; c >= 0; --c) {
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
