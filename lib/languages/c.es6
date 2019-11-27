/** @babel */
/* global */ // eslint-disable-line

import { Node } from '../node.es6'
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
  constructor ({debug, template}) {
    super(debug)

    this.template = template || this.defaultTemplate
  }

  getCodeBlock (iter) {
    var isFunction = false

    for (iter.next(); !iter.done; iter.next()) {
      switch (iter.value) {
        case '(':
          isFunction = true
          iter.seekToBlockEnd(')')
          break
        case '{':
          if (isFunction)
            return iter.result + "}"
          iter.seekToBlockEnd('}')
          return iter.result
        case ';':
          return iter.result
        case '[':
          iter.seekToBlockEnd(']')
          break
      }
    }

    return false
  }

  iterateTree (walker, {level, scope, context}) {
    var node

    do {
      this.log(level, walker.nodeType, walker.currentNode);

      switch (walker.nodeType) {
        case "function_declarator":
          scope.setFlag("function")
          break

        case "array_declarator":
        case "parameter_list":          // function parameters
        case "field_declaration_list":  // struct members
          context.unshift(walker.nodeType)
          this.log(`Entering scope "${context[0]}"`)
          break

        case "]":
        case "}":
        case ")":
          this.log(`Leaving scope "${context[0]}"`)
          context.shift()
          break

        case "field_declaration":
        case "parameter_declaration":
          this.log(`Creating node for "${context[0]}"`)
          node = new Node(scope)
          scope.addChild(node)
          break

        case ",":
          if (context[0] === "field_declaration_list") {
            const parent = scope.getParent()
            if (!parent)
              throw new Error("Expected to have a parent node")

            this.log("Cloning current scope", scope)

            scope = scope.clone()
            parent.addChild(scope)
          }
          break

        case "typedef":
          scope.setClass(walker.nodeText)
          break

        case "union":
        case "struct":
        case "enum":
        case "type_identifier":
        case "primitive_type":
          scope.addType(walker.nodeText)
          break

        case "identifier":
          if (context[0] === "array_declarator")
            break;
        case "field_identifier":
          scope.setName(walker.nodeText)
          break
      }

      if (walker.gotoFirstChild()) {
        this.iterateTree(walker, {
          scope: node || scope,
          context,
          level: level + 1,
        })
      }

    } while (walker.gotoNextSibling())

    walker.gotoParent()
  }

  parseCode (row) {
    const node = this.getTree(row)
    var walk

    if (!node || !(walk = node.walk()) || !walk.gotoFirstChild())
      return false

    const scope = new Node()

    this.iterateTree(walk, {
      level: 1,
      scope,
      context: []
    })

    return scope//.node
  }

  getTemplate () {
    return this.template
  }

  defaultTemplate (node, {Line, Tab, Align}) {
      const _class = node.class
      const _type = node.hasType("struct|union|enum")
      const _maxName = node.maxNameLength
      var params = false

      if (_class) {
        Line(_class, " ", node.getType(-1), ` - ${Tab("[description]")}`)
      }
      else if (node.hasFlag("function")) {
        Line(`${node.name}()`, ` - ${Tab("[description]")}`)
      }
      else if (_type) {
        Line(node.type, ` - ${Tab("[description]")}`)
      }
      else {
        Line(`@${Tab(node.name)}: `, ` - ${Tab("[description]")}`)
      }

      for (const child of node) {
        params = params || Line('')
        Line(
          `@${Tab(child.name)}: `,
          Align(_maxName - child.name.length),
          Tab("[description]")
        )
      }

      if (node.hasFlag("function") && !node.hasType('void')) {
        Line('')
        Line('@return: ', Tab("[description]"))
      }
    }
}
