'use strict';
const ObjectId = require('mongodb').ObjectId;
RegExp.prototype.toJSON = RegExp.prototype.toString;

module.exports = class MCollection {
  /**
   *
   * @param dbInstance mongodb.Db
   * @param collectionName String
   * @param cacheClient Redis
   */
  constructor(dbInstance, collectionName, cacheClient) {
    this.dbInstance = dbInstance;
    this.collectionName = collectionName;

    if (cacheClient) {
      this.setCacheClient(cacheClient);
    }
  }

  async init() {
    this.collection = await this.dbInstance.collection(this.collectionName);
  }

  /**
   * set cache client and enable behaviors
   *
   * @param cacheClient
   */
  setCacheClient(cacheClient) {
    this.cacheClient = cacheClient;
    this.useCache = cacheClient.status === 'ready';
    this.cacheClient.setMaxListeners(50);
    this.cacheClient.on('end', () => {
      this.useCache = false;
    });
    this.cacheClient.on('error', (err) => {
      this.useCache = false;
    });
    this.cacheClient.on('ready', () => {
      this.useCache = true;
    });
  }

  async _preInsert() {
    await this.setupTimestamps();
  }

  _preUpdate() {
    this.updateTimestamps();
  }

  async _postSave() {
    this.doc = this.docs = this.update = null;
    if (this.useCache) {
      if (this.update && this.update._id) {
        await this.cacheClient.deleteWildcard("*" + this.update._id.toString() + "*");
      }
      await this.clearCache();
    }
  }

  async _postDelete() {
    if (this.useCache) {
      await this.clearCache();
    }
  }

  async find(query, options = {skipCache: false}) {
    let results;
    if (this.useCache && !options.skipCache) {
      results = await this.findInCache(query, options);
      if (!results) {
        results = await this.collection.find(query, options).toArray();
        await this.storeInCache(query, options, results);
      }
    } else {
      results = await this.collection.find(query, options).toArray();
    }
    return results;
  }

  async findOne(query, options = {skipCache: false}) {
    let results;
    if (this.useCache && !options.skipCache) {
      results = await this.findInCache(query, options);
      if (!results) {
        results = await this.collection.findOne(query, options);
        await this.storeInCache(query, options, results);
      }
    } else {
      results = await this.collection.findOne(...arguments);
    }
    return results;
  }

  async findOneAndDelete() {
    const delRes = this.collection.findOneAndDelete(...arguments);
    await this._postDelete();
    return delRes;
  }

  async remove() {
    const delRes = this.collection.remove(...arguments);
    await this._postDelete();
    return delRes;
  }

  async insertOne(doc, options) {
    this.doc = doc;
    await this._preInsert();
    const insertRes = await this.collection.insertOne(this.doc, options);
    await this._postSave();
    return insertRes;
  }

  async insertMany(docs, options) {
    this.docs = docs;
    await this._preInsert();
    const insertRes = await this.collection.insertMany(this.docs, options);
    await this._postSave();
    return insertRes;
  }

  async updateOne(filters, update, options) {
    this.update = update;
    await this._preUpdate();
    const updateRes = this.collection.updateOne(filters, this.update, options);
    await this._postSave();
    return updateRes;
  }

  async findOneAndUpdate(filters, update, options = {}) {
    if (!options.hasOwnProperty("returnOriginal")) {
      options.returnOriginal = false;
    }
    this.update = update;
    await this._preUpdate();
    let updateRes = await this.collection.findOneAndUpdate(filters, this.update, options);
    if (
      options.upsert // option upsert was set to true
      && updateRes.lastErrorObject.n === 1 // a document has actually been upserted
      && updateRes.lastErrorObject.updatedExisting === false // upserted document wasn't existing before operation
    ) {
      updateRes = await this.collection.findOneAndUpdate({_id: updateRes.value._id}, {$set: {createdAt: updateRes.value.updatedAt}}, {returnOriginal: false});
    }
    await this._postSave();
    return updateRes.value;
  }

  async updateMany(filters, update, options) {
    this.update = update;
    await this._preUpdate();
    const updateRes = await this.collection.updateMany(filters, this.update, options);
    await this._postSave();
    return updateRes;
  }

  async setupTimestamps() {
    if (!!this.doc && typeof this.doc === "object") {
      this.doc.createdAt = this.doc.createdAt || new Date();
      this.doc.updatedAt = this.doc.updatedAt || new Date();
    }
    if (!!this.docs && Array.isArray(this.docs)) {
      await Promise.all(this.docs.map((doc, i) => {
        doc.createdAt = doc.createdAt || new Date();
        doc.updatedAt = doc.updatedAt || new Date();
        this.docs[i] = doc;
      }));
    }
  }

  updateTimestamps() {
    this.update.$set = this.update.$set || {};
    this.update.$set.updatedAt = new Date();
  }

  async findInCache(query, options) {
    const key = this.generateCacheKey(query, options);
    return JSON.parse(await this.cacheClient.get(key));
  }

  async storeInCache(query, options, value) {
    const key = this.generateCacheKey(query, options);
    let valueToStore;
    if (Array.isArray(value)) {
      valueToStore = value.slice();
      await Promise.all(valueToStore.map((subValue) => {
        subValue._inCache = true;
      }));
    } else {
      valueToStore = Object.assign({_inCache: true}, value);
    }
    return await this.cacheClient.set(key, JSON.stringify(valueToStore));
  }

  async clearCache() {
    const [nbKeys, nbKeysDeleted] = await this.cacheClient.deleteWildcard(this.collectionName + "*");
  }

  generateCacheKey(query, options = {}) {
    return this.collectionName + "_" + JSON.stringify(query) + "-" + JSON.stringify(options);
  }
};