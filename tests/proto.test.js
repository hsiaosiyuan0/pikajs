function Person(name) {
  this.name = name;
}

let sayHi = function() {
  return "Hello I'm " + this.name;
};

Person.prototype.sayHi = sayHi;

let p = new Person("tom");
assert(p.name, "tom");
assert(Person.prototype.sayHi, sayHi);
assert(p.sayHi, sayHi);
assert(p.sayHi(), "Hello I'm tom");

Person.prototype.sayHi = function() {
  return "sayHi1";
};

print(p.sayHi());
assert(p.sayHi(), "sayHi1");
