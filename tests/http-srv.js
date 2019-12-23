let http = require("http");

let i = 0;
let srv = http.createServer(function(req, res) {
  print("new req: " + i);
  res.write("Hello World");
  res.end();
  i = i + 1;
});

let port = 8080;
srv.listen(port);

print("Server is running at: " + port);
