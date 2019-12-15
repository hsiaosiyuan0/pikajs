function addOne(a) {
  return function() {
    return a + 1;
  };
}

assert(addOne(1)(), 2)
