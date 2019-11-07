/** @babel */
/* global atom console */ // eslint-disable-line

import { CompositeDisposable } from 'atom';
import { Manager } from './manager.es6'

export default {
  subscriptions: null,
  manager: null,

  activate () {
    console.log("activate")
    this.manager = new Manager()

    this.subscriptions = new CompositeDisposable()
    this.subscriptions.add(atom.commands.add('atom-text-editor', {
      'commentator:parse-tab': (e) => {
        if (!this.manager.onTab())
          e.abortKeyBinding()
      },
      'commentator:parse-enter':  (e) => {
        if (!this.manager.onEnter())
          e.abortKeyBinding()
      },
      'commentator:parse-inline': (e) => {
        if (!this.manager.onInline())
          e.abortKeyBinding()
      }
    }));
  },

  deactivate () {
    console.log("deactivate")
    this.manager.destroy()
    this.subscriptions.dispose();
  },
};
