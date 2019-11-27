/** @babel */
/* global Symbol console */ // eslint-disable-line

export class Node {
  constructor (parent) {
    this.__parent     = parent
    this.__name       = ""
    this.__types      = []
    this.__children   = []
    this.__flags      = []
  }

  clone () {
    const other = new Node()

    other.__types    = [ ...this.__types ]
    other.__children = [ ...this.__children ]
    other.__flags    = [ ...this.__flags ]

    return other
  }

  getParent () {
    return this.__parent
  }

  setType (type) {
    if (Array.isArray(type))
      this.__types = [ ...type ]
    else if (type)
      this.__types = [ type ]
    else
      this.__types = []
  }

  addType (type) {
    this.__types.push(type)
  }

  hasType (expr) {
    const match = this.__types.join(" ").match(expr)

    return match && match[0]
  }

  getType (index) {
    if (index < 0)
      return this.__types[this.__types.length + index]
    return this.__types[index]
  }

  getTypes (del = " ") {
    if (del != null)
      return this.__types.join(del)
    return this.__types
  }

  setName (name) {
    this.__name = name || ""
  }

  setClass (name) {
    this.__class = name
  }

  setFlag (flag) {
    if (Array.isArray(flag))
      this.__flags = [ ...flag ]
    else if (flag)
      this.__flags = [ flag ]
    else
      this.__flags = []
  }

  addFlag (flag) {
    this.__flags.push(flag)
  }

  hasFlag (expr) {
    const match = this.__flags.join(" ").match(expr)

    return match && match[0]
  }

  getFlags (del = " ") {
    if (del != null)
      return this.__flags.join(del)
    return this.__flags
  }

  addChild (node) {
    this.__children.push(node)
  }

  hasChildren () {
    return this.__children.length
  }

  get type () {
    return this.__types.join(" ")
  }

  get class () {
    return this.__class
  }

  get name () {
    return this.__name
  }

  get flags () {
    return this.__flags.join(" ")
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
