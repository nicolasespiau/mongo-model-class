'use strict';

const ObjectId = require('mongodb').ObjectId;
const _ = require('@bonjourjohn/utils').Objects;

module.exports = class MModel {
  constructor(schema, params = null) {
    _.inspectSchema(schema);
    this.schema = schema;

    if (params) {
      this.load(params);
    }
  }

  load(params) {
    //validate that params match schema
    _.matchFieldsAndTypes(params, this.schema);
    //populate object with params
    this.loadParams(params);
  }

  loadParams(params, target = null, schema = null) {
    //if no target specified populate current object, otherwise populate target
    if (!target) {
      target = this;
    }
    //if no schema given use the current object's full schema, otherwise use the given one
    if (!schema) {
      schema = this.schema;
    }

    //for each key in schema check if it contains a sub schema sub objects and load sub params according to that or populate object's current key otherwise
    for (const key of Object.keys(schema)) {
      //if key refers to an sub object load params into corresponding current object's sub object
      if (schema[key].constructor.name === "Object") {
        target[key] = global[schema[key].constructor.name]();
        this.loadParams(_.getValueAt(params, key), target[key], schema[key]);
      } else if ((schema[key].constructor.name === "Array" && schema[key][0].constructor.name === "Object")) {
        // if key refers to an Array of sub objects load params into corresponding current object's sub object
        target[key] = global[schema[key].constructor.name]();
        //cleanly load every objets in param
        for (let i in params[key]) {
          target[key][i] = {};
          this.loadParams(params[key][i], target[key][i], schema[key][0]);
        }
      } else {
        target[key] = _.getValueAt(params, key);
      }
    }
  }

  get(key = null) {
    if (key) {
      if (!_.hasProperty(this.schema, key)) {
        throw new Error("Object " + this.constructor.name + " has no property " + key);
      } else {
        return _.getValueAt(this, key);
      }
    }

    let object = Object.assign({}, this);
    object = _.keepProperties(object, Object.keys(this.schema));
    _.removeEmptyProperties(object);

    return object;
  }
};