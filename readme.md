# MONGO MODEL CLASS

## Purpose

I have decided to use the [native MongoDB Node JS driver](https://mongodb.github.io/node-mongodb-native/).

This model class is designed to simplify the developpement of object oriented projects.

It provides a basic ModelClass that is supposed to serve as an abstract class.
It provides overrides for main insert, find and update functions.

It also allows developper to set up a cache and to define specific pre insert, pre update and post save behaviors.

This module also provides a cache client generator based on [ioredis](https://github.com/luin/ioredis).

Provided to Model constructor, it allows you to use a Redis cache to store responses to Mongo queries in order to improve performances.

##  Quick start

First you need to create a class extending the Model Class.

The conscructor needs to be overriden. The native constructor takes 3 arguments:

- `dbInstance` is the instance of a Mongo Db
- `foo` is the collection name this class is related to
- `cacheClient` is the ioredis cache client this object is going to use. This param is not mandatory

_Foo.class_:
```javascript
const Model = require('mongo-model-class').Model;

module.exports = class Foo extends Model {
  constructor(dbInstance, cacheClient) {
    super(dbInstance, 'foo', cacheClient);
  }
};
```

In your code, where you need your object instance:

without cache:

```javascript
const MongoClient = require('mongodb').MongoClient;

const FooClass = require('./path/to/Foo.class');
const Mclient = new MongoClient(SERVER, OPTIONS).connect();
const MDB = Mclient.db(DBNAME);

const Foo = new FooClass(MDB);
Foo.init(); //loads the dedicated MongoCollection into object instance 
```

with cache:

```javascript
const MongoClient = require('mongodb').MongoClient;

const FooClass = require('./path/to/Foo.class');
const Mclient = new MongoClient(SERVER, OPTIONS).connect();
const cacheClient = require('mongo-model-class').Cache(CACHEOPTS);

const MDB = Mclient.db(DBNAME, cacheClient);

const Foo = new FooClass(MDB);
Foo.init(); //loads the dedicated MongoCollection into object instance 
```

## Model native properties list

Here are the properties you can find in an instaciated Model object once it's been initiated (it's ready to work):

- `this.dbInstance` instance of Mongodb Db
- `this.collection` instance of Mongodb Collection
- `this.collecionName` string, equivalent to `this.collection.collectionName`
- `this.cacheClient` instance of Redis client _(if cacheClient set, not mandatory)_
- `this.useCache` bool, true if `this.cacheClient` is set and ready, false otherwise. It can be set to `false` if you want to skip cache.

Temporary properties:

- `this.doc` JSON object, document that is going to be inserted in collection. It will exist only during insert process (from _preInsert to _postSave)
- `this.docs` JSON object, documents that are going to be inserted in collection. It will exist only during insert process (from _preInsert to _postSave)
- `this.update` JSON object, update query that will be used by an update method. It will exist only during update process (from _preUpdate to _postSave)

## Model methods list

Here are the methods provided by this Model class, and the desciption of their usefulness.

### Constructor

`constructor(dbInstance, collectionName, cacheClient)`

Creates a new Model object.

#### Params:

- `dbInstance` Mongodb Db object
- `collectionName` name of the collection the current instance has to be linked to
- `cacheClient` *not mandatory* Redis cache client

### init

`init()`

Get the `collectionName` collection in given Db and set it as an object instance local var `this.collection`.

### setCacheClient

`setCacheClient(cacheClient)`

Store given cache client into `this.cacheClient`.
Set `this.useCache` to true if cache client is ready.
Attach listeners:

- `on('ready')` to set `this.useCache` to `true`
- `on('end')` to set `this.useCache` to `false`
- `on('error')` to set `this.useCache` to `false`

#### Params

- `cacheClient` instance of Redis client

### _preInsert()

Called in `insertOne` and `insertMany` methods.
Execute all pre insert actions.

It can be overriden. Native behavior consist in adding timestamps fields `createdAt` and `updatedAt` to document(s).

### _preUpdate()

Called in `findOneAndUpdate`, `updateMany` and `updateOne` methods.
Execute all pre update actions.

It can be overriden. Native behavior consist in added the update of `updatedAt` field in update query if it's not already present.

### _postSave()

Called at then end of all saving process: `insertOne`, `insertMany`, `findOneAndUpdate`, `updateMany` and `updateOne`.
Execute all post save actions.

It can be overriden. Native behavior consist in clearing cache if cache is on.

### _postDelete()

Called at then end of all deleting process: `remove`, `findOneAndDelete`.
Execute all post delete actions.

It can be overriden. Native behavior consist in clearing cache if cache is on.

### find(), findOne(), findOneAndDelete(), insertOne(), insertMany(), updateOne(), findOneAndUpdate(), updateMany()

These methods will do the exact same thing as they do when their called on Mongodb Collection objects, except two things:

- they will execute _pre and _post methods before and after process
- they will try to read in cache and/or write result in cache, or flush cache according to the nature of the operation (read, write, delete)

They all take the same arguments their analogue in Mongo Collection object, but you can add this option field:

- `skipCache` bool, tell method to skip reading in cache and to go straigth to database.

Example:

```javascript
const results = await Foo.findOne({"fieldName": "value"}, {"skipCache": true});
```

### setupTimestamps()

Add fields `createdAt` and `updatedAt` into document stored in `this.doc` or into documents stored in `this.docs`.

### updateTimestamps()

Add `updatedAt` to `$set` part of the query stored in `this.update`. Create the `$set` part if it does not exist.

### findInCache(query, options)

Check if given query already has a result in cache with given options and return them if it has.
Return false otherwise.

Called by read methods when `this.useCache` is `true`.


### storeInCache(query, options, value)

Stores `value` into cache under a key generated from given `query` and `options`.

Called by read methods when `this.useCache` is `true`.

### clearCache()

Clears the cache for the current collection name. IE. flush all keys corresponding to the pattern `COLLECTIONNAME*`

## Testing

### Requirements

You need a MongoDB and a Redis server running.

Use these Docker images:
 - [MongoDB](https://hub.docker.com/_/mongo/)
 - [Redis](https://hub.docker.com/_/redis/)

```shell
docker run --name database -p 27017:27017 -d mongo
docker run --name cache -p 6379:6379 -d redis:3.0.6-32bit
```

Regarding your needs, you can use your own Redis and Mongo applications/servers/containers.

Once everything is running, just run the tests:

```shell
npm test
```