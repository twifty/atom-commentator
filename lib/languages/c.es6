/** @babel */
/* global */ // eslint-disable-line

import { Scope } from '../node.es6'
import { Builder } from '../builder.es6'

export default class CBuilder extends Builder {
  /*
    # /**
    #  * function_name(:)? (- short description)?
    # (* @parameterx: (description of parameter x)?)*
    # (* a blank line)?
    #  * (Description:)? (Description of function)?
    #  * (section header: (section description)? )*
    #  (**)/
  */
  constructor (debug) {
    super(debug)
  }

  iterateTree (walker, level) {
    var params = false

    do {
      this.log(level, walker.nodeType, walker.currentNode);

      switch (walker.nodeType) {
        case "(":
        case "{":
          this.scope.enter()
          break
        case ")":
          if (params)
            this.scope.finalize()
          // Fallthrough
        case "}":
          this.scope.leave()
          break
        case ",":
          if (!params)
            break
          // Fallthrough
        case ";":
          this.scope.finalize()
          break
        case "typedef":
          this.scope.setClass(walker.nodeText)
          break
        case "union":
        case "struct":
        case "type_identifier":
        case "primitive_type":
          this.scope.addType(walker.nodeText)
          break
        case "identifier":
        case "field_identifier":
          this.scope.addName(walker.nodeText)
          break
        case "parameter_declaration":
          params = true
          break
      }

      if (walker.gotoFirstChild())
        this.iterateTree(walker, level + 1)

    } while (walker.gotoNextSibling())

    walker.gotoParent()
  }

  parseCode (row) {
    const node = this.getTree(row)
    var walk

    if (!node || !(walk = node.walk()) || !walk.gotoFirstChild())
      return false

    this.scope = new Scope()

    this.iterateTree(walk, 1)

    return this.scope.node
  }

  defaultTemplate (node, {Line, Tab, Align}) {
      const _class = node.class
      const _type = node.is("struct|union|enum")
      const _maxName = node.maxNameLength
      var params = false

      Line(_class, _class && " ", _type ? node.type : node.name, ` - ${Tab("[description]")}`)

      for (const child of node) {
        params = params || Line('')
        Line(`@${Tab(child.name)}: `, Align(_maxName - child.name.length), Tab("[description]"))
      }

      if (node.name) {
        Line('')
        Line('@return:', Tab("[description]"))
      }
    }
}
