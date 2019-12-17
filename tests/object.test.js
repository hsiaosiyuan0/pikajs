let a = {
    b: 1,
    fn: (a) => a + 1
}
assert(a.b, 1);
assert(a.fn(1), 2);