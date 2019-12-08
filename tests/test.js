let a = 1;

function addOne(a) {
  return a + 1;
}

function addTwo(a) {
  return a + 2;
}

function add(a) {
  return addOne(a) + addTwo(a);
}

assert(add(a), 5);
