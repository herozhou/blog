---
title: "Node 启动过程"
date: 2017-10-01T01:37:56+08:00
lastmod: 2017-10-03T01:37:56+08:00
draft: false
tags: ["Node.js"]
categories: ["Node.js源码分析"]
author: "herozhou工巧"
---

> 问题引入 node app.js 做了什么?为什么可以将我们的代码运行起来？

<!--more-->

文件这么多我们先要从入口文件 ```node_main.cc``` 入手 

# 入口文件 —— node_main.cc
```
// node-v8.9.0/src/node_main.cc

int wmain(int argc, wchar_t *wargv[]) {
  if (!IsWindows7OrGreater()) {
    fprintf(stderr, "This application is only supported on Windows 7, "
                    "Windows Server 2008 R2, or higher.");
    exit(ERROR_EXE_MACHINE_TYPE_MISMATCH);
  }
  
  ... 
  // Convert argv to to UTF8
  ...
  
  // Now that conversion is done, we can finally start.
  return node::Start(argc, argv);
}
```
判断了一下是否是低版本的 ```windows``` 操作系统，将传入的命令行参数转成UTF-8编码。最后启动 ```node::Start()```

看下 ```node::Start()``` 函数的源码

## 启动函数 —— node::Start()
```
// node-v6.11.5/src/node.cc 
int Start(int argc, char** argv) {
  PlatformInit();
  
  ...
  
 
  v8_platform.Initialize(v8_thread_pool_size, uv_default_loop());
  V8::Initialize();
  const int exit_code =
  
      //调用重载函数Start
      Start(uv_default_loop(), argc, argv, exec_argc, exec_argv);
  ...
}

inline int Start(uv_loop_t* event_loop,
                 int argc, const char* const* argv,
                 int exec_argc, const char* const* exec_argv) {

  int exit_code;
  {
   // 加上锁
    Locker locker(isolate);
    // 根据当前实例创建作用域
    Isolate::Scope isolate_scope(isolate);
    // 创建句柄作用域
    HandleScope handle_scope(isolate);
    // 初始化实例数据
    IsolateData isolate_data(isolate, event_loop, allocator.zero_fill_field());
    // 调用另一个重载函数Start
    exit_code = Start(isolate, &isolate_data, argc, argv, exec_argc, exec_argv);
  }
  return exit_code;
}

inline int Start(Isolate* isolate, IsolateData* isolate_data,
                 int argc, const char* const* argv,
                 int exec_argc, const char* const* exec_argv) {
   // 创建句柄作用域
  HandleScope handle_scope(isolate);
  // 创建上下文
  Local<Context> context = Context::New(isolate);
  // 创建运行上下文
  Context::Scope context_scope(context);
  // 声明环境对象
  Environment env(isolate_data, context);
  
  ...
    Environment::AsyncCallbackScope callback_scope(&env);
    //初始化环境
    LoadEnvironment(&env);
  ...
    事件循环（后面章节会分析）
  ...
}
```

我们看到有三个 ```Start``` 函数，通过重载形成调用过程。
## V8 概念
注意出现的几个概念：```Isolate```、```Handle```、```Scope```、```Context```。江陵老师的著作已经讲的很好了 [V8概念](https://yjhjstz.gitbooks.io/deep-into-node/content/chapter2/chapter2-0.html)，这里引用一下
### Isolate(实例) 

> An isolate is a VM instance with its own heap. It represents an isolated instance of the V8 engine.
> V8 isolates have completely separate states. Objects from one isolate must not be used in other isolates.

```Isolate``` 代表了一个v8引擎的实例。每一个 ```Isolate``` 维护自己内部的状态。 ```Isolate``` 内创建的js对象无法在另一个 ```Isolate``` 中使用， ```v8``` 允许创建多个 ```Isolate``` 并使它们并行运行在多个线程中。同一个 ```Isolate``` 同一时间只能在单个线程内运行。并且要求使用 ```Locker/Unlocker``` 使他们同步执行
一个 ```Isolate``` 是一个独立的虚拟机。对应一个或多个线程。但同一时刻 只能被一个线程进入。所有的 ```Isolate``` 彼此之间是完全隔离的, 它们不能够有任何共享的资源。如果不显示创建 ```Isolate```, 会自动创建一个默认的 ```Isolate```。

后面提到的 ```Context、Scope、Handle``` 的概念都是一个 ```Isolate``` 内部的

### Handle 概念
在 ```V8``` 中，内存分配都是在 ```V8``` 的 ```Heap``` 中进行分配的，```JavaScript``` 的值和对象也都存放在 ```V8``` 的 ```Heap``` 中。这个 ```Heap``` 由 ```V8``` 独立的去维护，失去引
用的对象将会被 ```V8``` 的 ```GC``` 掉并可以重新分配给其他对象。而 ```Handle``` 即是对 ```Heap``` 中对象的引用。```V8``` 为了对内存分配进行管理，```GC``` 需要对 ```V8``` 中的
所有对象进行跟踪，而对象都是用 Handle 方式引用的，所以 ```GC``` 需要对 ```Handle``` 进行管理，这样 ```GC``` 就能知道 ```Heap``` 中一个对象的引用情况，当一个对象的 ```Handle``` 引用发生改变的时候，```GC``` 即可对该对象进行回收或者移动。因此，```V8``` 编程中必须使用 ```Handle``` 去引用一个对象，而不是直接通过 ```C
++``` 的方式去获取对象的引用，直接通过 ```C++``` 的方式去引用一个对象，会使得该对象无法被 V8 管理。

```Handle``` 分为 ```Local``` 和 ```Persistent``` 两种。

从字面上就能知道，```Local``` 是局部的，它同时被 ```HandleScope``` 进行管理。
```persistent```，类似与全局的，不受 ```HandleScope``` 的管理，其作用域可以延伸到不同的函数，而 ```Local``` 是局部的，作用域比较小。
```Persistent Handle``` 对象需要 ```Persistent::New```, ```Persistent::Dispose``` 配对使用，类似于 ```C++``` 中 ```new``` 和 ```delete```。

```Persistent::MakeWeak``` 可以用来弱化一个 ```Persistent Handle```，如果一个对象的唯一引用 ```Handle``` 是一个 ```Persistent```，则可以使用 ```MakeWeak``` 方法来弱化该引用，该方法可以触发 ```GC``` 对被引用对象的回收。

### Scope
从概念上理解，作用域可以看成是一个句柄的容器，在一个作用域里面可以有很多很多个句柄（也就是说，一个 ```scope``` 里面可以包含很多很多个
```v8``` 引擎相关的对象），句柄指向的对象是可以一个一个单独地释放的，但是很多时候（真正开始写业务代码的时候），一个一个地释放句柄过于
繁琐，取而代之的是，可以释放一个 ```scope```，那么包含在这个 ```scope``` 中的所有 ```handle``` 就都会被统一释放掉了。

```Scope``` 在 ```v8.h``` 中有这么几个：```HandleScope```，```Context::Scope```。

```HandleScope``` 是用来管理 ```Handle``` 的，而 ```Context::Scope``` 仅仅用来管理 ```Context``` 对象。

代码像下面这样：
```c++
  // 在此函数中的 Handle 都会被 handleScope 管理
  HandleScope handleScope;
  // 创建一个 js 执行环境 Context
  Handle<Context> context = Context::New();
  Context::Scope contextScope(context);
  // 其它代码
```
一般情况下，函数的开始部分都放一个 ```HandleScope```，这样此函数中的 ```Handle``` 就不需要再理会释放资源了。
而 ```Context::Scope``` 仅仅做了：在构造中调用 ```context->Enter()```，而在析构函数中调用 ```context->Leave()```。


### Context 概念
从概念上讲，这个上下文环境也可以理解为运行环境。在执行 ```Javascript``` 脚本的时候，总要有一些环境变量或者全局函数。
我们如果要在自己的 ```c++``` 代码中嵌入 ```v8``` 引擎，自然希望提供一些 ```c++``` 编写的函数或者模块，让其他用户从脚本中直接调用，这样才会体现出 ```Javascript``` 的强大。
我们可以用 ```c++``` 编写全局函数或者类，让其他人通过 ```Javascript``` 进行调用，这样，就无形中扩展了 ```Javascript``` 的功能。

```Context``` 可以嵌套，即当前函数有一个 ```Context```，调用其它函数时如果又有一个 ```Context```，则在被调用的函数中 ```Javascript``` 是以最近的
```Context``` 为准的，当退出这个函数时，又恢复到了原来的 ```Context```。

我们可以往不同的 ```Context``` 里 “导入” 不同的全局变量及函数，互不影响。据说设计 ```Context``` 的最初目的是为了让浏览器在解析 ```HTML``` 的 ```iframe```
时，让每个 ```iframe``` 都有独立的 ```Javascript``` 执行环境，即一个 ```iframe``` 对应一个 ```Context```。


## 执行js代码 —— LoadEnvironment
重要的是```LoadEnvironment```函数:
```
// node-v8.9.0/src/node.cc
void LoadEnvironment(Environment* env) {
  HandleScope handle_scope(env->isolate());

  ...

  // Execute the lib/internal/bootstrap_node.js file which was included as a
  // static C string in node_natives.h by node_js2c.
  // 'internal_bootstrap_node_native' is the string containing that source code.
  // （译）通过node_js2c执行在被当作C字符串的lib/internal/bootstrap_node.js 文件
  Local<String> script_name = FIXED_ONE_BYTE_STRING(env->isolate(),
                                                    "bootstrap_node.js");
  Local<Value> f_value = ExecuteString(env, MainSource(env), script_name);

  // The bootstrap_node.js file returns a function 'f'
  // (译)  bootstrap_node.js 返回一个函数 'f'
  CHECK(f_value->IsFunction());
  
  //转换类型
  Local<Function> f = Local<Function>::Cast(f_value);

  // Add a reference to the global object
  // （译）添加一个引用到全局变量中
  Local<Object> global = env->context()->Global();

  ...

  // Expose the global object as a property on itself
  // (Allows you to set stuff on `global` from anywhere in JavaScript.)
  // （译）将全局变量暴露为它自己的一个属性，允许你从JavaScript的任何地方设置属性到global上
  global->Set(FIXED_ONE_BYTE_STRING(env->isolate(), "global"), global);

  // Now we call 'f' with the 'process' variable that we've built up with
  // all our bindings. Inside bootstrap_node.js and internal/process we'll
  // take care of assigning things to their places.
  // （假的翻译）现在我们可以使用我们已经编译好的process变量调用'f'（call with是使用...调用吗？）
  // （假的翻译）在bootstrap_node.js和internal/process 里面我们会关心把事情分配给他们的地方。
    
    
  // We start the process this way in order to be more modular. Developers
  // who do not like how bootstrap_node.js sets up the module system but do
  // like Node's I/O bindings may want to replace 'f' with their own function.
  // （译）我们以这种方式启动进程会更模块化，不喜欢 bootstrap_node.js 新设置模块系统
  // （译）但是喜欢Node's I/O bindings 的开发者可能想用他们自己的函数取代 'f'。
  
  Local<Value> arg = env->process_object();
  f->Call(Null(env->isolate()), 1, &arg);
}


// Executes a str within the current v8 context.
//（译）在当前v8上下文中执行一个字符串
static Local<Value> ExecuteString(Environment* env,
                                  Local<String> source,
                                  Local<String> filename) {
  
 // 编译字符串为脚本
 MaybeLocal<v8::Script> script =
      v8::Script::Compile(env->context(), source, &origin);

 // 执行脚本
  Local<Value> result = script.ToLocalChecked()->Run();
  
  ...
  
  return scope.Escape(result);
}
``` 

有如下调用逻辑：这几个函数都在node.cc中 
```
Start() --> Start() --> Start() --> LoadEnvironment() --> ExecuteString()
```
最后的```ExecuteString(env, MainSource(env), script_name)``` 函数，传入当前环境、上文提到过的```MainSource```编译之后的源码、脚本名称，在函数体里调用V8的 ```Script::Compile()``` 和 ```Run()```两个接口去解析执行```bootstrap_node.js```文件，返回值是一个```f_value```。  ```f_value``` 就是下面```bootstrap_node.js```中的匿名函数。


而这个```f_value``` 通过V8的接口 ```Local<Function>::Cast```转换成一个```Local<Function>```类型的变量```f``` ，而```Local<Function>```类型是V8中表示一个函数的C++类型。
在```LoadEnvironment()```的最后一行通过 ```f->Call()```，去执行```bootstrap_node.js```，进入了js的世界。

## JavaScript入口文件 —— bootstrap_node.js
而 ```bootstrap_node.js``` 文件在下章会具体讲，这里看下大致源码：
```javascript
//终于遇见了我们最熟悉的JavaScript代码
// node-v8.9.0/lib/internal/bootstrap_node.js

(function(process) {

  function startup(){
     ...
     
     if (process.argv[1] && process.argv[1] !== '-') {
        // make process.argv[1] into a full path
     // make process.argv[1] into a full path
        const path = NativeModule.require('path');
        process.argv[1] = path.resolve(process.argv[1]);

        const Module = NativeModule.require('module');
        
        preloadModules();
        Module.runMain();
      }
      
     ...
  };
 startup();
});
 
```

这个```process.argv[1]```就是node命令行启动的时候，main函数接收的参数。比如```node  app.js```启动，```process.argv[1]```就保存着我们的JavaScript文件名 ```app.js``` 了。而 ```NativeModule``` 是Node提供加载模块的一个构造函数（类），它可以加载内置的 ```JavaScript``` 模块，这里加载了 ```module```模块，也是一个加载模块的构造函数（类）,两者的区别在于 ```NativeModule``` 加载的是内置模块，```Module``` 加载的是所有模块或文件（ \*.js，\*.json,*.node）。

看下```Module.runMain ```做了什么
## 加载模块核心文件 —— Module
```javascript
// node-v8.9.0/lib/module.js

// bootstrap main module.
Module.runMain = function() {
  // Load the main module--the command line argument.
  Module._load(process.argv[1], null, true);
  // Handle any nextTicks added in the first tick of the program
  process._tickCallback();
};

Module._load = function(request, parent, isMain) {
  
  //简化了一些判断是否是内置模块的代码，这里只贴出加载代码的一部分
  // 具体源码会在下篇剖析
  ...
  var filename = Module._resolveFilename(request, parent, isMain);
  var module = new Module(filename, parent);
  tryModuleLoad(module, filename);
 
  ...
  return module.exports;
};

function tryModuleLoad(module, filename) {

    ...
    module.load(filename);
}
Module.prototype.load = function(filename) {
 
  var extension = path.extname(filename) || '.js';
  if (!Module._extensions[extension]) extension = '.js';
  
  Module._extensions[extension](this, filename);
 
};
// Native extension for .js
Module._extensions['.js'] = function(module, filename) {

  //从本地同步读取文件
  var content = fs.readFileSync(filename, 'utf8');
  module._compile(internalModule.stripBOM(content), filename);
};

Module.prototype._compile = function(content, filename) {

  // create wrapper function
  var wrapper = Module.wrap(content);

  //在当前上下文运行这个文件
  var compiledWrapper = vm.runInThisContext(wrapper, {
    filename: filename,
    lineOffset: 0,
    displayErrors: true
  });
  
  return result;
};
```
调用逻辑是 
```
runMain()->_load()->tryModuleLoad()->load()->_extensions()-
->_compile() ->runInThisContext() 
```
``` var content = fs.readFileSync(filename, 'utf8');```从本地同步读取（在这里是```app.js```)文件,经过``` Module.wrap(content)```包装之后(包装原理我们会在下篇讲)，```runInThisContext()```在当前上下文执行这个代码，也就是我们的```app.js```。这样我们的应用就启动起来了。

# 总结
Node启动过程:

0. 输入命令行命令：node app.js
1. 初始化v8引擎
2. 初始化线程池和事件循环队列
3. 初始化运行环境
4. 取出被转化为C++ ASCII码值数组的 ```bootstrap_node.js``` 文件，转换为字符串。
5. 编译执行转换之后的字符串，返回值为一个匿名函数
6. 将该匿名函数转化为C++类型
7. 执行该函数
8. 加载 ```Module``` 内建模块
9. 以命令行参数为文件名加载文件(即传来的app.js)
10. 判断文件扩展名，不同扩展名加载方式不同。这里是js
11. 读取文件
12. 包装文件（加上 ```require```、```exports``` 、```module``` 等参数）
13. 运行
14. 结束

# 精选面试题

[Node.js 启动方式：一道关于全局变量的题目引发的思考](https://ruby-china.org/topics/28207)