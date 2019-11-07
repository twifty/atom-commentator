/** @babel */
/* global Symbol console */ // eslint-disable-line

export class Node {
  constructor (parent) {
    this.__parent     = parent
    this.__name       = ""
    this.__types      = []
    this.__children   = []
  }

  setType (type) {
    this.__types = []
    if (type)
      this.addType(type)
  }

  addType (type) {
    this.__types.push(type)
  }

  is (expr) {
    const match = this.__types.join(" ").match(expr)

    return match && match[0]
  }

  setName (name) {
    this.__name = name || ""
  }

  setClass (name) {
    this.__class = name
  }

  get type () {
    return this.__types.join(" ")
  }

  get name () {
    return this.__name
  }

  get maxNameLength () {
    if (this.__max_name_length == null) {
      this.__max_name_length = 0

      for (const child of this.__children) {
        if (child.__name)
          this.__max_name_length = Math.max(this.__max_name_length, child.__name.length)
        else
          this.__max_name_length = Math.max(this.__max_name_length, child.maxNameLength)
      }
    }

    return this.__max_name_length
  }

  get maxTypeLength () {
    if (this.__max_type_length == null) {
      this.__max_type_length = 0

      for (const child of this.__children)
        this.__max_type_length = Math.max(this.__max_type_length, child.type.length)
    }

    return this.__max_type_length
  }

  *[Symbol.iterator]() {
    for (const child of this.__children) {
      if (child.__name)
        yield child
      else
        yield *child
    }
  }
}

export class Scope extends Node {
  constructor() {
    super()

    this.__name = "global"
    this.__scopes = [ new Node(this) ]
    this.__active = this.__scopes[0]
  }

  setType (type) {
    this.__active.setType(type)
  }

  addType (type) {
    this.__active.addType(type)
  }

  setName (name) {
    this.__active.setName(name)
  }

  addName (name) {
    // finalize active if it has a name
    if (this.__active.__name) {
      // Copy will share children and types
      const copy = new Node(this.__active.__parent)

      this.__active.__parent.__children.push(this.__active)
      this.__active = copy
      this.__scopes[this.__scopes.length - 1] = copy
    }

    this.__active.setName(name)
  }

  setClass (name) {
    this.__active.setClass(name)
  }

  finalize () {
    this.__active.__parent.__children.push(this.__active)
    this.__active = new Node(this.__active.__parent)
    this.__scopes[this.__scopes.length - 1] = this.__active
  }

  enter () {
    this.__scopes.push( new Node(this.__active) )
    this.__active = this.__scopes[this.__scopes.length - 1]
  }

  leave () {
    if (this.__scopes.length <= 1)
      throw new Error("No more scopes")

    this.__scopes.pop()
    this.__active = this.__scopes[this.__scopes.length - 1]
  }

  get node () {
    return this.__children[0]
  }
}
