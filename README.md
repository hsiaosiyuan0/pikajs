<p align="center">
  <img src="./images/pika.png" width="180" />
</p>

<p align="center">PikaJS - 使用 TypeScript 编写的 JavaScript 解释器</p>

<hr>

对于想深入了解 JavaScript 引擎内部执行机理的同学，是否在面对语言标准 [Standard ECMA-262](http://www.ecma-international.org/ecma-262/6.0/) 或者浩如烟海的引擎源码时感到手足无措？

不如让我们一起使用 TypeScript 来编写一个 JavaScript 解释器，切身感受一下引擎的基本运行原理，迎接未来的扬帆远航。

## 进度

- [ ] 解释器编码
- [ ] 课程章节

总体上分为两部分，先完成解释器代码的编码工作，然后再完成相应的章节。*每天会有固定的更新，可以通过 Watch 或者 Star 关注更新。*

## 运行

大家可以先通过运行 `tests` 目录下的测试案例来体验一下效果，通过下面的命令执行程序：

```
npx pikajs path-to-your-source.js
```

`path-to-your-source.js` 可以是磁盘路径或者网络文件，因此我们可以通过下面的命令在控制台打印 `hello world`

```
npx pikajs https://raw.githubusercontent.com/hsiaosiyuan0/PikaJS/master/tests/hello.test.js
```

甚至还可以在本地启动一个 HTTP 服务：

```
npx pikajs https://raw.githubusercontent.com/hsiaosiyuan0/PikaJS/master/tests/http-srv.js
```
