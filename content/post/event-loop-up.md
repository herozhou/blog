
---
title: "自顶向下 —— 事件循环的原理"
date: 2017-10-14T01:37:56+08:00
lastmod: 2017-10-14T01:37:56+08:00
draft: false
tags: ["Node.js","Node.js事件循环"]
categories: ["Node.js源码分析"]
author: "herozhou工巧"
---


 > 问题：server.listen(80) 怎么就可以监听事件了？

 自顶向下 —— listen(80)和回调函数的调用
 
 <!--more-->

## 用户层 —— app.js 
回到代码中，我们使用了listen(80)怎么就可以监听事件了呢？
```javascript
// app.js 

var http = require('http');

function requestListener(req, res) {
    res.end('hello world');
}

var server = http.createServer(requestListener);
server.listen(80);
```  
在```http.js```中```createServer```创建一个```Server```对象并返回：
```javascript
//node-v8.9.0/lib/http.js

 function createServer(requestListener) {
  return new Server(requestListener);
}
```
在```_http_server```中定义了这个```Server```类：
```javascript
//node-v8.9.0/lib/_http_server.js

function Server(requestListener) {
  if (!(this instanceof Server)) return new Server(requestListener);
  net.Server.call(this, { allowHalfOpen: true });
  
 if (requestListener) {
    this.on('request', requestListener);
  }
  
  this.on('connection', connectionListener);

  
}
function connectionListener(socket) {
    parser.onIncoming = parserOnIncoming.bind(undefined, this, socket, state);
}

function parserOnIncoming(server, socket, state, req, keepAlive) {
  res.shouldKeepAlive = keepAlive;
  DTRACE_HTTP_SERVER_REQUEST(req, socket);
  LTTNG_HTTP_SERVER_REQUEST(req, socket);
  COUNTER_HTTP_SERVER_REQUEST();

  server.emit('request', req, res);
}
 
```
1. ```http``` 层的 ```Server``` 类继承了```socket层（net.js）```的 ```Server``` 类。并添加 ```request``` 和 ```connection``` 事件监听器。
2. 当有连接到来时， ```socket``` 层会触发 ```connection``` 事件
3. 监听着这个事件的```http``` 层函数```connectionListener``` 调用 ```parserOnIncoming``` ，拿到来自 ```socket``` 层的一个 ```socket``` 对象，进行跟 ```http``` 协议相关的处理，把 ```http``` 请求相关的数据封装成 ```req```、```res``` 两个对象，然后触发 ```request``` 事件，把 ```req、res``` 传给在 ```app.js``` 用户定义的 ```requestListener``` 回调函数。

## Socket层 —— net.js 

net.Server是负责 ```socket``` 层的 ```Server``` 类：
```javascript
// node-v8.9.0/lib/net.js

function Server(options, connectionListener) {
  if (!(this instanceof Server))
    return new Server(options, connectionListener);

  EventEmitter.call(this);
}
util.inherits(Server, EventEmitter);
Server.prototype.listen = function(...args) {
  listenInCluster(this, null, -1, -1, backlogFromArgs);
}
function listenInCluster(server, address, port, addressType,
                         backlog, fd, exclusive) {

  if (cluster.isMaster || exclusive) {
    // Will create a new handle
    // _listen2 sets up the listened handle, it is still named like this
    // to avoid breaking code that wraps this method
    server._listen2(address, port, addressType, backlog, fd);
    return;
  }
}
function setupListenHandle(address, port, addressType, backlog, fd) {

  rval = createServerHandle(address, port, addressType, fd);
  this._handle = rval;
  this._handle.onconnection = onconnection;
  this._handle.owner = this;
}

Server.prototype._listen2 = setupListenHandle;  // legacy alias

function onconnection(err, clientHandle) {
  var handle = this;
  var self = handle.owner;
  var socket = new Socket({
    handle: clientHandle,
    allowHalfOpen: self.allowHalfOpen,
    pauseOnCreate: self.pauseOnConnect
  });
  socket.readable = socket.writable = true;

  self.emit('connection', socket);
}

// node-v8.9.0/lib/net.js
const { TCP } = process.binding('tcp_wrap');

function createServerHandle(address, port, addressType, fd) {

    handle = new TCP();
 
  return handle;
}

```

### 设置listen环节 ——  设置onconnection
A. 设置listen环节 
```Server.prototype.listen() -> listenInCluster() -> server._listen2() ```
而``` server._listen2()```就是```setupListenHandle```函数，它创建了一个 ```TCP ```类对象(注意了TCP不是C\++本身的类，而是C++用来表示js类的  ```FunctionTemplate``` )赋值给```this._handle```，并给它的```onconnection```属性赋上```onconnection```回调函数。

### 回调环节 —— 调用onconnection

当有连接到来时，底层回调了TCP类的```onconnection```函数（self._handle.onconnection），并传过来一个 ```clientHandle```，```onconnection``` 把 ```clientHandle``` 封装成 ```socket``` 对象，并触发 ```connection``` 事件，把 ```socket``` 传给上层的 ```connectionListener``` 监听器。

## TCP层 —— tcp_wrap.cc
上面说到 ```socket``` 层的 ```Server``` 类与下层的交互是通过 ```this._handle``` —— TCP类对象。
```
// node-v8.9.0/src/tcp_wrap.cc

Local<String> tcpString = FIXED_ONE_BYTE_STRING(env->isolate(), "TCP");

//  创建一个函数模板，在js文件中使用 TCP 表示这个类
Local<FunctionTemplate> t = env->NewFunctionTemplate(New);
t->InstanceTemplate()->Set(env->onconnection_string(), Null(env->isolate()));
 
 // 将方法设置到函数模板的原型上
  env->SetProtoMethod(t, "open", Open);
  env->SetProtoMethod(t, "bind", Bind);
  env->SetProtoMethod(t, "listen", Listen);
  env->SetProtoMethod(t, "connect", Connect);


void TCPWrap::Listen(const FunctionCallbackInfo<Value>& args) {
  TCPWrap* wrap;
  ASSIGN_OR_RETURN_UNWRAP(&wrap,
                          args.Holder(),
                          args.GetReturnValue().Set(UV_EBADF));
  int backlog = args[0]->Int32Value();
  
  int err = uv_listen(reinterpret_cast<uv_stream_t*>(&wrap->handle_),
                      backlog,
                      OnConnection);
                      
  args.GetReturnValue().Set(err);
}
```
### listen环节 —— TCPWrap::Listen
看到 ```TCP``` 这一层，执行 ```listen``` 时传给下层的回调函数是 ```OnConnection```，而且可以看到与这一层交互的下一层就是。
.```TCP```层使用 ```libuv``` 的接口 —— ```uv_listen``` 监听到来的连接
[libuv文档](http://docs.libuv.org/en/v1.x/stream.html#c.uv_listen)对uv_listen的定义：
> 开始监听传入的连接。 backlog表示内核可能排队的连接数。 当收到新的传入连接时，会调用```uv_connection_cb```回调。

注意到``` t->InstanceTemplate()->Set(env->onconnection_string(),Null(env->isolate()));```这段代码将函数模版t的类属性 ```onconnection``` 被设置成了 ```null``` 。在上文执行``` this._handle.onconnection = onconnection;```才将其设置成了真正有效的函数。

### 回调环节
.```OnConnection```：使用来执行js的函数
```
// node-v8.9.0/src/connection_wrap.cc
void ConnectionWrap<WrapType, UVType>::OnConnection(uv_stream_t* handle,
                                                    int status) {
 // 得到客户端传来的stream流数据并转化类型
 WrapType* wrap_data = static_cast<WrapType*>(handle->data);
 
  if (status == 0) {
    // 得到客户端，如果失败返回<0的值
    if (uv_accept(handle, client_handle))
      return;
     
    // 将客户端对象赋值给handle
    argv[1] = client_obj;
  }
  
  // 调用回调函数并传入数据
  wrap_data->MakeCallback(env->onconnection_string(), arraysize(argv), argv);
}

关于MakeCallback的实现在AsyncWrap类 —— TCPWrap的基类：
// node-v8.9.0/src/async_wrap.cc
MaybeLocal<Value> AsyncWrap::MakeCallback(const Local<Function> cb,
                                          int argc,
                                          Local<Value>* argv) {
  async_context context { get_async_id(), get_trigger_async_id() };
  return InternalMakeCallback(env(), object(), cb, argc, argv, context);
}
// node-v8.9.0/src/node.cc
MaybeLocal<Value> InternalMakeCallback(Environment* env,
                                       Local<Object> recv,
                                       const Local<Function> callback,
                                       int argc,
                                       Local<Value> argv[],
                                       async_context asyncContext) {
  
  
    ret = callback->Call(env->context(), recv, argc, argv);
}
```
当新的客户端连接到来时，```libuv```的 ```uv_listen```监听到连接并调用回调函数 ```OnConnection``` ，在该函数内执行 ```uv_accept``` 接收连接
[libuv文档](http://docs.libuv.org/en/v1.x/stream.html#c.uv_accept)对```uv_accept```的定义：
> 这个函数与uv_listen（）一起使用来接受传入的连接。 在接收到uv_connection_cb接受连接后调用此函数。 在调用这个函数之前，客户端句柄必须被初始化。 <0返回值表示错误。

最后将js层的回调函数 ```onconnection``` (保存在 ```env->onconnection_string()``` )和接收到的客户端 ```stream ``` 数据传入 ```MakeCallback``` 中。在 ```MakeCallback``` 中执行js层的 ```onconnection``` 函数。


## libuv层
在app.js里面的server.listen(80)，通过http.Server -> net.Server -> TCPWrap，终于到达了libuv层。这一层，我们看到6.1节的数据结构的使用细节。关于io观察者如何被保存、如何被事件循环取出使用的细节，我们看6.3节。
```
int uv_listen(uv_stream_t* stream, int backlog, uv_connection_cb cb) {
  int err;

  switch (stream->type) {
  case UV_TCP:
    err = uv_tcp_listen((uv_tcp_t*)stream, backlog, cb);
    break;

  case UV_NAMED_PIPE:
    err = uv_pipe_listen((uv_pipe_t*)stream, backlog, cb);
    break;

  default:
    err = -EINVAL;
  }

}

int uv_tcp_listen(uv_tcp_t* tcp, int backlog, uv_connection_cb cb) {
  static int single_accept = -1;
  int err;
  tcp->connection_cb = cb;
  tcp->flags |= UV_HANDLE_BOUND;

  /* Start listening for connections. */
  tcp->io_watcher.cb = uv__server_io;
  uv__io_start(tcp->loop, &tcp->io_watcher, POLLIN);

  return 0;
}

void uv__server_io(uv_loop_t* loop, uv__io_t* w, unsigned int events) {
  
  uv__io_start(stream->loop, &stream->io_watcher, POLLIN);

  /* connection_cb can close the server socket while we're
   * in the loop so check it on each iteration.
   */
  while (uv__stream_fd(stream) != -1) {
   
    err = uv__accept(uv__stream_fd(stream));
 
    stream->accepted_fd = err;
    stream->connection_cb(stream, 0);

  
  }
}
```
### listen环节 
看到 ```uv_tcp_listen``` 函数，它是 ```uv_listen``` 的具体实现。通过调用 ```uv__io_start``` 把自身的 ```io_watcher``` 注册进 ```tcp->loop```（理解为 ```default_loop_struct``` —— 事件循环的数据结构）。
这里注意到，从上层传过来的 ```cb``` 回调函数也就是 ```TCPWrap::OnConnection``` 保存在了 ```tcp->connection_cb``` ，而 ```tcp->io_watcher.cb``` 保存的是  ```uv__server_io```。
### 回调环节
当有连接到来时，事件循环直接调用的cb是 ``` tcp->io_watcher.cb```，也就是 ```uv__server_io```，先执行 ``` uv__io_start```将 ```stream->io_watcher``` 注册进事件循环。当有stream数据到来时 ```uv__accept``` 拿到到来的连接，再调用 ```stream->connection_cb``` 并传入到来的stream数据。( )
再疏通一下这里比较绕的地方:

```stream->connection_cb``` 也就是```tcp->connection_cb ```，而 ```tcp->connection_cb = cb;``` 这行代码指明```tcp->connection_cb```就是传进来的```OnConnection```函数。

所以 ```stream->connection_cb``` 就是 ```OnConnection``` 函数。

这里提一下：
> uv_tcp_t is a ‘subclass’ of uv_stream_t.  

TCP 是一种面向连接的流式协议, 因此是基于 libuv 的流式基础架构上的.
所以uv_tcp_t 是 uv_stream_t 的一个子类

  

最后看下 ```uv__io_start``` 函数把 I/O 观察者保存到指定的事件循环数据结构 —— loop。来看看 ```uv__io_start``` 的细节：
```

void uv__io_start(uv_loop_t* loop, uv__io_t* w, unsigned int events) {
  ...
  
  if (QUEUE_EMPTY(&w->watcher_queue))
    QUEUE_INSERT_TAIL(&loop->watcher_queue, &w->watcher_queue);

  if (loop->watchers[w->fd] == NULL) {
    loop->watchers[w->fd] = w;
    loop->nfds++;
  }
}

```
这里的loop就是事件循环数据结构体(例如```tcp->loop```)，w就是I/O观察者结构体(例如``` tcp->io_watcher.cb```)。

可以看到，添加一个io观察者需要两步操作：

使用 ```QUEUE_INSERT_TAIL``` 往 ```loop->watcher_queue``` 添加 I/O 观察者。
把 I/O 观察者保存在 ```loop->watchers``` 中 —— 以fd文件描述符为索引的数组。```loop->watchers``` 实际上类似于映射表的功能，而不是观察者队列

# 总结

## 发起 I/O 
* 用户在 ```Javascript``` 代码引入底层模块，v8引擎加载 ```Node``` 核心模块(C++)，将参数和回调函数传入到核心模块
* Node 核心模块(C++)会将传入的参数和回调函数封装成一个请求对象(request)
* 将这个请求对象推入到 I/O 线程池等待执行
* ```Javascript``` 发起的异步调用结束，```Javascript``` 线程继续执行后续操作。

## 执行回调
* I/O 操作完成后，会将结果储存到请求对象的 ```result``` 属性上，并发出操作完成的通知
* 每次事件循环时会检查是否有完成的 I/O 操作，如果有就将请求对象加入到 I/O 观察者队列中，之后当做事件处理；
* 处理 I/O 观察者事件时，会取出之前封装在请求对象中的回调函数，执行这个回调函数，并将 ```result``` 当参数，以完成 ```Javascript``` 回调。
