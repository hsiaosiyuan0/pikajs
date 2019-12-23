function Person(name, age) {
  this.name = name;
  this.age = age;
}

let p = new Person("tom", 20);
assert(p.name, "tom");
assert(p.age, 20);
