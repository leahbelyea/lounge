## Modeling <a id="model"></a>

**Basics**

We begin defining a data model using a schema.

```js
var userSchema = lounge.schema({
  firstName: String,
  lastName: String,
  age: Number,
  usernames: [String],
  setup: Boolean
  metadata: {
    createdAt: Date,
    updatedAt: Date
  }
});
```

We can add additional properties using `add` function:

```js
userSchema.add('name', String);
```

Alternatively we can explicitly specify the type using `type` property:

```js
var catSchema = lounge.schema({
  name: { type: String }
  breed: String,
});

catSchema.add('age', {type: String});
```

Schema options can be set at construction or using the `set` function.

```js
var catSchema = lounge.schema({
  name: { type: String }
  breed: String,
});

catSchema.set('minimize', false);
```

**Document keys**

By default schemas come with an `id` property as the document key, and the automatically generated value will be
a [UUID](https://en.wikipedia.org/wiki/Universally_unique_identifier)
using [node-uuid](https://www.npmjs.com/package/node-uuid) `v4()` function. This should be most practical and
appropriate in a lot of cases. Alternatively you can specify explicit key properties:

```js
var userSchema = lounge.schema({
  firstName: String,
  lastName: String,
  email: { type: String, key: true, generate: false }
});
```

Here we desire `email` to be used as the document key and we specify `generate: false` because we do not want Lounge
to automatically handle key property value generation. If we still want uuid generation but in a different property
we can specify so:

```js
var userSchema = lounge.schema({
  firstName: String,
  lastName: String,
  email: String,
  userId: {type: String, key: true, generate: true }
});
```

`generate` does not have to be set explicitly to `true` as that is the default.

We can specify additional prefix and/or suffix for keys. This will be used when wrigin to the database as the actual
document key.

```js
var userSchema = lounge.schema({
  firstName: String,
  lastName: String,
  email: { type: String, key: true, generate: false, prefix: 'user'}
});
```

Note that setting prefix and suffix options like this will take presidence over any `keyPrefix` and `keySuffix`
options specified in the second options parameter to the `schema()` call or any settings in the lounge config.

**Examples**

```js
var lounge = require('lounge');

// ... connect

var userSchema = lounge.schema({
  name: String
  email: { type: String, key: true, generate: false, prefix: 'user::'}
});

var User = lounge.model('User', userSchema);
var user = new User({name: 'Bob Smith', email: 'bsmith@acme.com'});
user.save();
```

This will save the user document under key `user::bsmith@acme.com`.

```js
var lounge = require('lounge');

// ... connect

var userSchema = lounge.schema({
  name: String
}, {
  keyPrefix: 'user::'
});

var User = lounge.model('User', userSchema);
var user = new User({name: 'Bob Smith'});
user.save();
```

This will automatically generate a uuid `id` property and save the user document under key
similar to `user::110ec58a-a0f2-4ac4-8393-c866d813b8d1`.

**Data manipulation**

Data in Model instances can be access directly or using `get` function. Similarly it can be manipulated using
either assignment operator or using the `set` function. In either case the input value is validated to be of proper type.

```js
var userSchema = lounge.schema({
  name: String
  friends: Number,
  dob: Date,
  setup: Boolean
});

var User = lounge.model('User', userSchema);
var user = new User({name: 'Bob Smith'});

user.get('name'); // 'Bob Smith'
user.name = 'Joe'; // OK
user.name.set('Joe'); // OK
console.log(user.name); // 'Joe'
user.set('friends', 20); // OK
user.friends = 'abc'; // nope. still 20
user.dob = new Date('July 5, 1980');
user.get('dob'); // instance of Date
user.set('setup', 'yup'); // nope
user.setup = true; // OK
```

**Validation**

Lounge does automatic validation against input data using the type information specified in the schema definition.
We can provide custom validation in schema definition by providing `validator` function.

```js
var validator = require('validator'); // Node validator module

var userSchema = lounge.schema({
  name: String
  email: {type: String, validate: validator.isEmail}
});

var User = lounge.model('User', userSchema);
var user = new User({ name: 'Bob Smith' });

user.email = 'bob@gmail.com'; // OK
user.email = 'bsmith'; // Nope
console.log(user.email); // 'bob@gmail.com'
```

**Virtuals**

Virtuals are document properties that you can get and set but that do not get persisted to the database.
The getters are useful for formatting or combining fields, while setters are useful for de-composing a single value
into multiple values for storage.

```js
var userSchema = lounge.schema({
  firstName: String,
  lastName: String
});

userSchema.virtual('fullName', {
  get: function () {
    return this.firstName + ' ' + this.lastName;
  },
  set: function (v) {
    if (v !== undefined) {
      var parts = v.split(' ');
      this.firstName = parts[0];
      this.lastName = parts[1];
    }
  }
});

var User = lounge.model('User', userSchema);
var user = new User({firstName: 'Bob', lastName: 'Smith'});
console.log(user.fullName); // Bob Smith
user.fullName = 'Jim Jones';
console.log(user.fullName); // Jim Jones
console.log(user.firstName); // Jim
console.log(user.lastName); // Jones
```

If no `set` function is defined the virtual is read-only.

**Statics**

Adding static methods to Models can be accomplished using `static()` schema function

```js
var userSchema = lounge.schema({
  firstName: String,
  lastName: String
});

userSchema.static('foo', function(p, q) {
  return p + q;
});

var User = lounge.model('User', userSchema);
User.foo(1, 2); // 3
```

We can also pass an object of function keys and function values, and they will all be added.

**Methods**

Similarly adding instance methods to Models can be done using `method()` schema function.

```js
var userSchema = lounge.schema({
  firstName: String,
  lastName: String
});

userSchema.method('fullName', function() {
  return this.firstName + ' ' + this.lastName;
});

var User = lounge.model('User', userSchema);
var user = new User({firstName: 'Bob', lastName: 'Smith'});
user.fullName(); // 'Bob Smith'
```

We can also pass an object of function keys and function values, and they will all be added.

**init() method**

There is a special `init` method that if specified in schema definition will be called at the end of model creation.
You can do additional setup here. This method is not passed in any arguments.

**toObject()**

Model instances come with `toObject` function that is automatically used for `console.log` inspection.

Options:

* `transform` - function used to transform an object once it's been converted to plain javascript representation from a
model instance.
* `minimize` - to "minimize" the document by removing any empty properties. Default: `true`
* `virtuals` - to apply virtual getters

These settings can be applied on any invocation of `toObject` as well they can be set at schema level.

```js
var userSchema = lounge.schema({
  name: String,
  email: String,
  password: String
});

var xform = function (doc, ret, options) {
  delete ret.password;
  return ret;
};

userSchema.set('toObject', {transform: xform});

var User = lounge.model('User', userSchema);

var user = new User({
  name: 'Joe',
  email: 'joe@gmail.com',
  password: 'password'
});

console.log(user); // { name: 'Joe', email: 'joe@gmail.com' }
```

**toJSON()**

Similar to `toObject`. The return value of this method is used in calls to `JSON.stringify`.

**CAS**

All document instances have a read-only property `cas` that returns the string representation of the CAS object retrieved
from the database. The `cas` property is initialized only once a document has been retrieved from the database using one
of query functions, or once it has been saved. Alternatively we can use the method `getCAS(raw)` to get the cas value.
If `raw` is `true` then we return the raw CAS object. Otherwise we return string representation. This can be useful
for computation of ETag values for example.

```js
console.log(doc.cas); // String: 00000000a71626e4
console.log(doc.getCAS()); // String: 00000000a71626e4
console.log(doc.getCAS(true)); // Object: CouchbaseCas<11338961768815788032>
```

**Useful member variables**

All model instances come with a `modelName` read only property that you can use to access the model name. As well
instances have `schema` property that represents the models schema used when creating the model with `model()` function.

```js
var userSchema = lounge.schema({
  name: String,
  email: String
});

var User = lounge.model('User', userSchema);
var user = new User({name: 'Bob Smith'});

console.log(user.modelName); // 'User'
console.log(user.schema instanceof lounge.Schema); // true
```

**Errors**

When setting a value fails, an error is generated silently. Errors can be retrieved with `getErrors()` and cleared with `clearErrors()`.

```js
var schema = new lounge.schema({
  id: {type: String, minLength: 5}
});

var Profile = lounge.model('Profile', schema);

var profile = new Profile();
profile.id = '1234';

console.log(profile.hasErrors()); // true

console.log(profile.getErrors());

// Prints:
[ { errorMessage: 'String length too short to meet minLength requirement.',
    setValue: '1234',
    originalValue: undefined,
    fieldSchema: { name: 'id', type: 'string', minLength: 5 } } ]

// Clear all errors.
profile.clearErrors();
```

### Types <a id="types"></a>

Supported types:
- String
- Number
- Boolean
- Date
- Array (including types within Array)
- Object (including typed Models for sub-schemas)
- 'any'

When a type is specified, it will be enforced. Typecasting is enforced on all types except 'any'. If a value cannot be typecasted to the correct type, the original value will remain untouched.

Types can be extended with a variety of attributes. Some attributes are type-specific and some apply to all types.

Custom types can be created by defining an object with type properties.

```js
var NotEmptyString = {type: String, minLength: 1};
country: {type: NotEmptyString, default: 'USA'}
```

#### General attributes

**transform**
Called immediately when value is set and before any typecast is done.

```js
name: {type: String, transform: function(value) {
  // Modify the value here...
  return value;
}}
```

**validate**
Called immediately when value is set and before any typecast is done. Can be used for validating input data.
If you return `false` the write operation will be cancelled.

```js
name: {type: String, validate: function(value) {
  // check
  return value;
}}
```

**default**
Provide default value. You may pass value directly or pass a function which will be executed when the object is initialized. The function is executed in the context of the object and can use "this" to access other properties (which .

```js
country: {type: String, default: 'USA'}
```

**get**
Provide function to transform value when retrieved. Executed in the context of the object and can use "this" to access properties.

```js
string: {type: String, getter: function(value) { return value.toUpperCase(); }}
```

**readOnly**
If true, the value can be read but cannot be written to. This can be useful for creating fields that reflect other values.

```js
fullName: {type: String, readOnly: true, default: function(value) {
  return (this.firstName + ' ' + this.lastName).trim();
}}
```

**invisible**
If true, the value can be written to but isn't outputted as an index when `toObject()` is called.
This can be useful for hiding internal variables.


#### String

**stringTransform**
Called after value is typecast to string **if** value was successfully typecast but called before all validation.

```js
postalCode: {type: String, stringTransform: function(string) {
  // Type will ALWAYS be String, so using string prototype is OK.
  return string.toUpperCase();
}}
```

**regex**
Validates string against Regular Expression. If string doesn't match, it's rejected.

```js
memberCode: {type: String, regex: new RegExp('^([0-9A-Z]{4})$')}
```

**enum**
Validates string against array of strings. If not present, it's rejected.

```js
gender: {type: String, enum: ['m', 'f']}
```

**minLength**
Enforces minimum string length.

```js
notEmpty: {type: String, minLength: 1}
```

**maxLength**
Enforces maximum string length.

```js
stateAbbrev: {type: String, maxLength: 2}
```

**clip**
If true, clips string to maximum string length instead of rejecting string.

```js
bio: {type: String, maxLength: 255, clip: true}
```

#### Number

**min**
Number must be > min attribute or it's rejected.

```js
positive: {type: Number, min: 0}
```

**max**
Number must be < max attribute or it's rejected.

```js
negative: {type: Number, max: 0}
```

#### Array

**unique**
Ensures duplicate-free array, using === to test object equality.

```js
emails: {type: Array, unique: true, arrayType: String}
```

**arrayType**
Elements within the array will be typed to the attributes defined.

```js
aliases: {type: Array, arrayType: {type: String, minLength: 1}}
```

An alternative shorthand version is also available -- wrap the properties within array brackets.

```js
aliases: [{type: String, minLength: 1}]
```

#### Object

**objectType**
Allows you to define a typed object.

```js
company: {type: Object, objectType: {
  name: String
}}
```

An alternative shorthand version is also available -- simply pass a descriptor.

```js
company: {
  name: String
}
```

#### Alias

**index (required)**

The index key of the property being aliased.

```js
zip: String,
postalCode: {type: 'alias', target: 'zip'}
// this.postalCode = 12345 -> this.toObject() -> {zip: '12345'}
```