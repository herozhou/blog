---
title: "Node Buffer源码分析"
date: 2017-10-10T16:01:23+08:00
lastmod: 2017-10-11T16:01:23+08:00
draft: false
tags: ["Node.js"]
categories: ["Node.js源码分析"]
author: "herozhou工巧"

---

这篇文章主要讲了 Node 中 buffer 加载的原理。

<!--more-->


# Buffer
在 Node.js v6 之前的版本中，```Buffer``` 实例是通过 ```Buffer``` 构造函数创建的，它根据提供的参数返回不同的 ```Buffer```：

* 传一个数值作为第一个参数给 ```Buffer()```（如 ```new Buffer(10)```），则分配一个指定大小的新建的 ```Buffer``` 对象。 在 ```Node.js 8.0.0``` 之前，分配给这种 ```Buffer``` 实例的内存是没有初始化的，且可能包含敏感数据。 这种 ```Buffer``` 实例随后必须被初始化，可以使用 ```buf.fill(0)``` 或写满这个 ```Buffer```。 虽然这种行为是为了提高性能而有意为之的，但开发经验表明，创建一个快速但未初始化的 ```Buffer``` 与创建一个慢点但更安全的 ```Buffer``` 之间需要有更明确的区分。从 ```Node.js 8.0.0``` 开始， ```Buffer(num)``` 和 ```new Buffer(num)``` 将返回一个初始化内存之后的 Buffer。
* 传一个字符串、数组、或 ```Buffer``` 作为第一个参数，则将所传对象的数据拷贝到 ```Buffer``` 中。
* 传入一个 ```ArrayBuffer```，则返回一个与给定的 ```ArrayBuffer``` 共享所分配内存的 Buffer。
因为 ```new Buffer()``` 的行为会根据所传入的第一个参数的值的数据类型而明显地改变，所以如果应用程序没有正确地校验传给 ```new Buffer()``` 的参数、或未能正确地初始化新分配的 ```Buffer``` 的内容，就有可能在无意中为他们的代码引入安全性与可靠性问题。

为了使 ```Buffer``` 实例的创建更可靠、更不容易出错，各种 ```new Buffer()``` 构造函数已被 废弃，并由 ```Buffer.from()```、```Buffer.alloc()```、和 ```Buffer.allocUnsafe()``` 方法替代。

## Buffer.alloc()
```javascript
// lib/buffer.js
function Buffer(arg, encodingOrOffset, length) {
  doFlaggedDeprecation();
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      );
    }
    return Buffer.alloc(arg);
  }
  return Buffer.from(arg, encodingOrOffset, length);
}
```
如果传入的第一个数是数字：
则调用 ```Buffer.alloc(arg)``` 创建一个新的 ```Buffer``` 实例
```javascript
// lib/buffer.js

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function(size, fill, encoding) {
  assertSize(size);
  if (size > 0 && fill !== undefined) {
    // Since we are filling anyway, don't zero fill initially.
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpreted as a start offset.
    if (typeof encoding !== 'string')
      encoding = undefined;
    return createUnsafeBuffer(size).fill(fill, encoding);
  }
  return new FastBuffer(size);
};

// FastBuffer
class FastBuffer extends Uint8Array {
  constructor(arg1, arg2, arg3) {
    super(arg1, arg2, arg3);
  }
}
FastBuffer.prototype.constructor = Buffer;

Buffer.prototype = FastBuffer.prototype;


// createUnsafeBuffer
function createUnsafeBuffer(size) {
  return new FastBuffer(createUnsafeArrayBuffer(size));
}

function createUnsafeArrayBuffer(size) {
  zeroFill[0] = 0;
  try {
    return new ArrayBuffer(size);
  } finally {
    zeroFill[0] = 1;
  }
}
```
* 如果参数> 0 并且没有指定默认填充数值，则使用 ```FastBuffer``` 创建一个空的基于 ```Uint8Array``` 数组即一个8位无符号整型数组，创建时内容被初始化为0。
* 如果参数不为 0 ，则使用 ```ArrayBuffer``` 开辟一个以 ```size``` 为固定长度的二进制数据缓冲区。我们不能直接操纵 ```ArrayBuffer``` 的内容，而应该创建一个表示特定格式的buffer的类型化数组对象( ```typed array objects ``` )或数据视图对象 ```DataView``` 来对buffer的内容进行读取和写入操作。这里 Node 将它转化为 ```FastBuffer``` 从而使用 ```Uint8Array``` 来操作它。

由此来看，正好对应了文档中那句话：```Buffer``` 实例也是 ```Uint8Array``` 实例

```ArrayBuffer对象```、```TypedArray``` 对象以及 ```DataView``` 对象在ES6的时候纳入了 ```ECMAScript``` 规范里面
* ```ArrayBuffer```:内存中一段原始的二进制数据，可以通过“视图”进行操作。
* ```Uint8Array``` :数组类型表示一个8位无符号整型数组，创建时内容被初始化为0。创建完后，可以以对象的方式或使用数组下标索引的方式引用数组中的元素
* ```TypedArray``` :描述一个底层的二进制数据缓存区的一个类似数组(array-like)视图
* ```Uint8Array``` :是 ```TypedArray``` 的一个实现。

简单点而言， **就是Buffer模块使用v8::ArrayBuffer分配一片内存，通过TypedArray中的v8::Uint8Array来去写数据** 

## Buffer.from()`
而如果传入的第一个参数不是数字：
```javascript

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function(value, encodingOrOffset, length) {

  if (typeof value === 'string')
    return fromString(value, encodingOrOffset);

  if (isAnyArrayBuffer(value))
    return fromArrayBuffer(value, encodingOrOffset, length);

  if (value === null || value === undefined)
    throw new TypeError(kFromErrorMsg);

  if (typeof value === 'number')
    throw new TypeError('"value" argument must not be a number');

  const valueOf = value.valueOf && value.valueOf();
  if (valueOf !== null && valueOf !== undefined && valueOf !== value)
    return Buffer.from(valueOf, encodingOrOffset, length);

  var b = fromObject(value);
  if (b)
    return b;

  if (typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(value[Symbol.toPrimitive]('string'),
                       encodingOrOffset,
                       length);
  }

  throw new TypeError(kFromErrorMsg);
};

```
* 如果第一个参数是 string 则新建一个包含所给的 JavaScript 字符串 string 的 Buffer 。 encoding 参数指定 string 的字符编码
* 如果第一个参数是 ArrayBuffer 类型的，则将创建一个 ArrayBuffer 的视图，而不会复制底层内存。例如，当传入一个 TypedArray 实例的 .buffer 属性的引用时，这个新建的 Buffer 会像 TypedArray 那样共享同一分配的内存。可选的 byteOffset 和 length 参数指定将与 Buffer 共享的 arrayBuffer 的内存范围
* 如果第一个参数对于其valueOf（）函数返回的值不完全等于自身的对象，则调用Buffer.from将该参数的实际数值转化为 Buffer 。
例如
```javascript
const buf = Buffer.from(new String('this is a test'));
// <Buffer 74 68 69 73 20 69 73 20 61 20 74 65 73 74>
```
* 如果第一个参数支持 ```Symbol.toPrimitive``` ，则调用Buffer.from将该参数转化为 Buffer
```javascript
class Foo {
  [Symbol.toPrimitive]() {
    return 'this is a test';
  }
}

const buf = Buffer.from(new Foo(), 'utf8');
// <Buffer 74 68 69 73 20 69 73 20 61 20 74 65 73 74>
```

## Buffer.allocUnsafe()
看过了```Buffer.from()```、```Buffer.alloc()```、接下来看看 ```Buffer.allocUnsafe()``` 方法
分配一个大小为 size 字节的新建的 Buffer 。 如果 size 大于 buffer.constants.MAX_LENGTH 或小于 0，则抛出 RangeError 错误。 如果 size 为 0，则创建一个长度为 0 的 Buffer。

以这种方式创建的 Buffer 实例的底层内存是未初始化的。 新创建的 Buffer 的内容是未知的，且可能包含敏感数据，可能携带该缓存区之前的数据，如果缓存里面的内容是一些私钥、密码等敏感信息的话就可有可能被泄漏出去。 可以使用 buf.fill(0) 初始化 Buffer 实例为0。
```javascript

Buffer.allocUnsafe = function(size) {
  assertSize(size);
  return allocate(size);
};

Buffer.poolSize = 8 * 1024;

function allocate(size) {
  if (size <= 0) {
    return new FastBuffer();
  }
  if (size < (Buffer.poolSize >>> 1)) {
    if (size > (poolSize - poolOffset))
      createPool();
    var b = new FastBuffer(allocPool, poolOffset, size);
    poolOffset += size;
    alignPool();
    return b;
  } else {
    return createUnsafeBuffer(size);
  }
}


function createPool() {
  poolSize = Buffer.poolSize;
  allocPool = createUnsafeArrayBuffer(poolSize);
  poolOffset = 0;
}
```

注意，```Buffer``` 模块会预分配一个大小为 ```Buffer.poolSize``` 的内部 ```Buffer``` 实例作为快速分配池， 用于使用 ```Buffer.allocUnsafe()``` 新创建的 ```Buffer``` 实例，以及废弃的 ```new Buffer(size)``` 构造器， 仅限于当 ```size``` 小于或等于 ```Buffer.poolSize >> 1``` （Buffer.poolSize 除以2后的最大整数值）。

对这个预分配的内部内存池的使用，是调用 ```Buffer.alloc(size, fill)``` 和 ```Buffer.allocUnsafe(size).fill(fill)``` 的关键区别。 具体地说，如果 ```size``` 小于或等于 ```Buffer.poolSize``` 的一半，则 ```Buffer.alloc(size, fill)``` 不会使用这个内部的 ```Buffer``` 池，而 ```Buffer.allocUnsafe(size).fill(fill)``` 会使用这个内部的 ```Buffer``` 池。 当应用程序需要 ```Buffer.allocUnsafe()``` 提供额外的性能时，这个细微的区别是非常重要的。

![image](https://segmentfault.com/img/bVLoJS?w=664&h=446)
如上图，如果当前存储了2KB的数据，后面要存储5KB大小数据的时候分配池判断所需内存空间大于4KB，则会去重新申请内存空间来存储5KB数据并且分配池的当前偏移指针也是指向新申请的内存空间，这时候就之前剩余的6KB(8KB-2KB)内存空间就会被搁置。

回头想一下 如果 size 大于 buffer.constants.MAX_LENGTH 或小于 0，则抛出 RangeError 错误 这句话
小于 0 抛出错误很正常，那么大于 buffer.constants.MAX_LENGTH 呢？这个数值代表着什么？
这个数值也就是kMaxLength —— 分配给单个 Buffer 实例的最大内存，定义在src/node_buffer.h中
```c
static const unsigned int kMaxLength =
    sizeof(int32_t) == sizeof(intptr_t) ? 0x3fffffff : 0x7fffffff;
```
在32位体系结构上，这个值是(2^30)-1 (~1GB)。 在64位体系结构上，这个值是(2^31)-1 (~2GB)。

# 总结

* new Buffer(): 依赖 Buffer.from() 和 Buffer.alloc()
* Buffer.from()
* * ArrayBuffer: 直接使用 ArrayBuffer 创建 FastBuffer
* * String: 小于 4k 使用8k池，大于 4k 调用 binding.createFromString()
* * Object: 小于 4k 使用8k池，大于 4k 调用 createUnsafeBuffer()
* Buffer.alloc(): 需要 fill buffer，用给定字符填充，否则用 0 填充
* Buffer.allocUnsafe(): 小于 4k 使用8k池，大于 4k 调用 createUnsafeBuffer()
* Buffer.allocUnsafeSlow(): 调用 createUnsafeBuffer()

# 精选面试题

```
let arr = [];
while(true)
  arr.push(new Buffer(1000));
```
会不会将内存爆掉？
答： buffer不走v8的local handle分配和释放，也就不属于v8的堆内内存部分，所以没有1.4g的限制，当然爆掉还是会的。可能会将内存爆掉，当主机的内存全部被node占满之后。


需要将一个足足有3.3GB的JSON ARRAY导入到我的项目中，然后并发的对数组内的元素进行处理
# 参考

* [http://nodejs.cn/api/buffer.html#buffer_buffer](http://nodejs.cn/api/buffer.html#buffer_buffer)
* [https://segmentfault.com/a/1190000008877009](https://segmentfault.com/a/1190000008877009)
* [https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array)