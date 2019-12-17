let a = {
  b: 1,
  fn: function(a) {
    this.b = a;
  }
};
a.fn(2);
assert(a.b, 2);
