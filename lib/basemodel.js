const EventEmitter = require('events')
const _ = require('lodash')
const clone = require('clone')
const { inspect } = require('util')

const _privateKey = require('./privatekey')
const { getFunctionName } = require('./utils')
const { defineProperty, clearField } = require('./basemodel.utils')

const tempEmitter = new EventEmitter()
const eventEmmiterInternals = Object.getOwnPropertyNames(tempEmitter)

function build (extendEventEmitter) {
  let ParentClass = class {}

  if (extendEventEmitter) {
    ParentClass = EventEmitter
  }

  class AbstractBaseModel extends ParentClass {
    /**
     * @classdesc Abstract Base Model representation for all created Document instances.
     * Represents just the document data and generic properties and functions.
     * Also used for "object" abstraction / representation of sub documents that are not actual Models / Documents.
     * Clients should never have to call this directly.
     *
     * @description Clients do not need to create <code>AbstractBaseModel</code> instances manually.
     * @class
     * @param {Object} values - the object data
     * @param {Object} options - creation options
     * @param {Boolean} options.clone - Whether to deep clone the incoming data. Default: <code>false</code>.
     *                                  Make sure you wish to do this as it has performance implications. This is
     *                                  useful if you are creating multiple instances from same base data and then
     *                                  wish to modify each instance.
     * @param {Schema} schema - schema instance
     * @returns {AbstractBaseModel}
     */
    constructor (values, options, schema) {
      super()

      // Object used to store internals.
      const _private = this[_privateKey] = {}

      // Object with getters and setters bound.
      _private._getset = this

      // Public version of ourselves.
      // Overwritten with proxy if available.
      _private._this = this

      // Object used to store raw values.
      _private._obj = {}

      _private.schema = schema

      // Errors, retrieved with getErrors().
      _private._errors = []

      // Define getters/typecasts based off of schema.
      _.each(schema.descriptor, (properties, index) => {
        // Use getter / typecast to intercept and re-route, transform, etc.
        defineProperty.call(_private._getset, index, properties)
      })

      // Proxy used as interface to object allows to intercept all access.
      // Without Proxy we must register individual getter/typecasts to put any logic in place.
      // With Proxy, we still use the individual getter/typecasts, but also catch values that aren't in the schema.
      if (typeof Proxy !== 'undefined') {
        const proxy = this[_privateKey]._this = new Proxy(this, {
          // Ensure only public keys are shown
          ownKeys: (target) => {
            return Object.keys(this.toObject())
          },

          // Return keys to iterate
          enumerate: (target) => {
            return Object.keys(this[_privateKey]._this)[Symbol.iterator]()
          },

          // Check to see if key exists
          has: (target, key) => {
            return Boolean(_private._getset[key])
          },

          // Ensure correct prototype is returned.
          getPrototypeOf: () => {
            return _private._getset
          },

          getOwnPropertyDescriptor: (target, key) => {
            const keys = Object.keys(this.schema.descriptor)
            const has = keys && keys.length && keys.indexOf(key) >= 0

            // Ensure readOnly fields are not writeable.
            return has ? {
              value: proxy[key],
              writeable: !schema.descriptor[key] || schema.descriptor[key].readOnly !== true,
              enumerable: true,
              configurable: true
            } : undefined
          },

          // Intercept all get calls.
          get: (target, name, receiver) => {
            // Support dot notation via lodash.
            if (schema.options.dotNotation && typeof name === 'string' && name.indexOf('.') !== -1) {
              return _.get(this[_privateKey]._this, name)
            }

            return Reflect.get(target, name, receiver)
            // Use registered getter without hitting the proxy to avoid creating an infinite loop.
            // return this[name]
          },

          // Intercept all set calls.
          set: (target, name, value, receiver) => {
            // Support dot notation via lodash.
            if (schema.options.dotNotation && typeof name === 'string' && name.indexOf('.') !== -1) {
              _.set(this[_privateKey]._this, name, value)
              return true
            }

            if (!schema.descriptor[name]) {
              // TODO revisit this
              if (extendEventEmitter && eventEmmiterInternals.indexOf(name) >= 0) {
                return true
              }

              if (schema.options.strict) {
                // Strict mode means we don't want to deal with anything not in the schema.
                // TODO: SetterError here.
                return false
              }

              // Add index to schema dynamically when value is set.
              // This is necessary for toObject to see the field.
              this._addToSchema(name, {
                type: 'any'
              })
            }

            return Reflect.set(target, name, value, receiver)
            // This hits the registered setter but bypasses the proxy to avoid an infinite loop.
            // this[name] = value
            // return true
          },

          // Intercept all delete calls.
          deleteProperty: (target, property) => {
            if (this.schema.descriptor[property]) {
              clearField.call(this[_privateKey]._this, property, this.schema.descriptor[property])
            }
            this[property] = undefined
            return true
          }
        })
      }

      // Populate schema defaults into object.
      _.each(schema.descriptor, (properties, index) => {
        if (properties.default !== undefined) {
          // Temporarily ensure readOnly is turned off to prevent the set from failing.
          const readOnly = properties.readOnly
          properties.readOnly = false
          this[index] = _.isFunction(properties.default) ? properties.default.call(this) : clone(properties.default)
          properties.readOnly = readOnly
        }
      })

      // Populate runtime values as provided to this instance of object.
      if (_.isObject(values)) {
        let data = values
        if (options.clone) {
          data = clone(values)
        }
        this.set(data)
      }

      // May return actual object instance or Proxy, depending on harmony support.
      return _private._this
    }

    /**
     * Get the model schema instance
     * @public
     * @returns {Schema}
     */
    get schema () {
      return this[_privateKey].schema
    }

    // Add field to schema and initializes getter and setter for the field.
    _addToSchema (index, properties) {
      this.schema.add(index, properties)
      defineProperty.call(this[_privateKey]._getset, index, this.schema.descriptor[index])
    }

    /**
     * Sets data on the document based on the schema.
     * Accepts a key of property and value for the property, or object representing the data for document.
     *
     * @public
     * @example
     * user.set('fistName', 'Joe')
     * user.set({ lastName: 'Smith' })
     */
    set (path, value) {
      if (_.isObject(path) && !value) {
        value = path
        for (const key in value) {
          if (value.hasOwnProperty(key)) {
            try {
              this[_privateKey]._this[key] = value[key]
            } catch (err) {}
          }
        }
      } else {
        try {
          this[_privateKey]._this[path] = value
        } catch (err) {}
      }
    }

    /**
     * Gets value at a specified path.
     * @param  {String} path The path / property to retrieve.
     * @return {*}      The value at the path.
     */
    get (path) {
      return this[path]
    }

    _prepareToObjectOptions (options, json) {
      const schemaMinimizeOption = json ? 'toJSON' : 'toObject'

      let defaultMinimizeOption = (this.schema.options &&
          this.schema.options[schemaMinimizeOption] &&
          _.isBoolean(this.schema.options[schemaMinimizeOption].minimize))
        ? this.schema.options[schemaMinimizeOption].minimize : true

      const defaultOptions = {
        transform: true,
        json,
        minimize: defaultMinimizeOption
      }

      // When internally saving this document we always pass options,
      // bypassing the custom schema options.
      if (!(options && getFunctionName(options.constructor) === 'Object') ||
        (options && options._useSchemaOptions)) {
        if (json) {
          options = this.schema.options.toJSON
            ? clone(this.schema.options.toJSON) : {}
          options.json = true
          options._useSchemaOptions = true
        } else {
          options = this.schema.options.toObject
            ? clone(this.schema.options.toObject) : {}
          options.json = false
          options._useSchemaOptions = true
        }
      }

      for (const key in defaultOptions) {
        if (defaultOptions.hasOwnProperty(key) && options[key] === undefined) {
          options[key] = defaultOptions[key]
        }
      }

      return options
    }

    /**
     *
     * @param options
     * @param json
     * @returns {{}}
     * @private
     */
    _toObject (options, json) {
      options = this._prepareToObjectOptions(options, json)

      // remember the root transform function
      // to save it from being overwritten by sub-transform functions
      const originalTransform = options.transform

      let ret = {}

      // Populate all properties in schema.
      _.each(this.schema.descriptor, (properties, index) => {
        // Do not write values to object that are marked as invisible.
        if (properties.invisible && !properties.virtual) {
          return
        }

        if (properties.virtual && !options.virtuals) {
          return
        }

        if (properties.serializable === false && options.serializable === false) {
          return
        }

        // Fetch value through the public interface.
        let value = this[_privateKey]._this[index]

        if (options.minimize && (_.isUndefined(value) || _.isNull(value))) {
          return
        }

        // Clone objects so they can't be modified by reference.
        if (typeof value === 'object' && value) {
          if (value._isBaseModel) {
            if (options && options.json && typeof value.toJSON === 'function') {
              value = value.toJSON(options)
            } else {
              value = value.toObject(options)
            }
          } else if (value._isObjectArray) {
            value = value.toArray()
          } else if (_.isArray(value)) {
            value = value.splice(0)
          } else if (_.isDate(value)) {
            // https://github.com/documentcloud/underscore/pull/863
            // _.clone doesn't work on Date object.
            const d = new Date(value.getTime())
            if (options.dateToISO === true) {
              ret[index] = d.toISOString()
            } else {
              ret[index] = new Date(value.getTime())
            }
          } else {
            value = _.clone(value)
          }

          // Don't write empty objects or arrays.
          if (!_.isDate(value) && options.minimize && !_.size(value)) {
            return
          }
        }

        // Write to object.
        ret[index] = value
      })

      let transform = options.transform

      // In the case where a subdocument has its own transform function, we need to
      // check and see if the parent has a transform (options.transform) and if the
      // child schema has a transform (this.schema.options.toObject) In this case,
      // we need to adjust options.transform to be the child schema's transform and
      // not the parent schema's
      if (transform === true || (this.schema.options.toObject && transform)) {
        const opts = options.json ? this.schema.options.toJSON : this.schema.options.toObject

        if (opts) {
          transform = (typeof options.transform === 'function' ? options.transform : opts.transform)
        }
      } else {
        options.transform = originalTransform
      }

      if (typeof transform === 'function') {
        const xformed = transform(this, ret, options)
        if (typeof xformed !== 'undefined') {
          ret = xformed
        }
      }

      return ret
    }

    /**
     * Converts this document into a plain javascript object.
     *
     * @public
     * @param {Object} options
     * @param {Function} options.transform - a transform function to apply to the resulting document before returning.
     * @param {Boolean} options.virtuals - apply virtual getters. Default: <code>false</code>
     * @param {Boolean} options.minimize - remove empty objects. Default: <code>true</code>
     * @param {Boolean} options.serializable - whether to include <code>serializable</code> properties. Default: <code>true</code>
     * @param {Boolean} options.dateToISO - convert dates to string in ISO format using <code>Date.toISOString()</code>. Default: <code>true</code>
     *
     * @return {Object} Plain javascript object representation of document.
     *
     * @example
     * var userSchema = lounge.schema({ name: String })
     * var User = lounge.model('User', userSchema)
     * var user = new User({name: 'Joe Smith'})
     * console.log(user) // automatically invokes toObject()
     *
     * @example <caption>Example with transform option.</caption>
     * var xform = function (doc, ret, options) {
     *   ret.name = ret.name.toUpperCase()
     *   return ret
     * }
     * console.dir(user.toObject({transform: xform}) // { name: 'JOE SMITH' }
     */
    toObject (options) {
      return this._toObject(options)
    }

    /**
     * Similar as <code>toObject</code> but applied when <code>JSON.stringify</code> is called
     *
     * @public
     * @param {Object} options - Same options as <code>toObject</code>.
     * @return {Object} Plain javascript object representation of document.
     */
    toJSON (options) {
      return this._toObject(options, true)
    }

    /**
     * Helper for <code>console.log</code>. Just invokes default <code>toObject</code>.
     * @public
     */
    inspect () {
      return this.toObject({})
    }

    /**
     * Helper for <code>console.log</code>. Alias for <code>inspect</code>.
     * @public
     */
    toString () {
      return inspect(this.inspect())
    }

    /**
     * Clear the document data. This can be overridden at schema level using <code>Schema.set()</code>.
     */
    clear () {
      _.each(this.schema.descriptor, (properties, index) => {
        clearField.call(this[_privateKey]._this, index, properties)
      })
    }

    /**
     * Gets the errors object.
     */
    getErrors () {
      return this[_privateKey]._errors
    }

    /**
     * Clears all the errors.
     */
    clearErrors () {
      this[_privateKey]._errors.length = 0
    }

    /**
     * Checks whether we have any errors.
     * @return {Boolean} <code>true</code> if we have errors, <code>false</code> otherwise.
     */
    hasErrors () {
      return Boolean(this[_privateKey]._errors.length)
    }

    /**
     * Used to detect instance of schema object internally.
     * @private
     */
    _isBaseModel () {
      return true
    }
  }

  return AbstractBaseModel
}

/**
 * @classdesc BaseModel implements <code>AbstractBaseModel</code> and is a representation for all created Document
 * instances that have a user defined schema. Represents just the document data and generic properties and functions.
 * Clients should never have to call this directly. Inherits <code>EventEmitter</code>
 *
 * @description Clients do not need to create <code>BaseModel</code> instances manually.
 * @class
 * @augments EventEmitter
 */
const BaseModel = build(true)

/**
 * @private
 * @classdesc PlainBaseModel implements <code>AbstractBaseModel</code> and is a representation for embedded subdocument
 * objects within user defined models. Clients should never have to call this directly.
 *
 * @description Clients do not need to create <code>PlainBaseModel</code> instances manually.
 * @class
 */
const PlainBaseModel = build()

exports.BaseModel = BaseModel
exports.PlainBaseModel = PlainBaseModel
