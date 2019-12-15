function add(a) {
  return function(b) {
    return function(c) {
      return a + b + c;
    };
  };
}

assert(add(1)(2)(3), 6);
assert(add(4)(5)(6), 15);
