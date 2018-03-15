---
title: "process.nextTick setImmediate 的区别"
date: 2017-10-15T01:37:56+08:00
lastmod: 2017-10-15T01:37:56+08:00
draft: false
tags: ["Node.js","Node.js事件循环"]
categories: ["Node.js事件循环"]
author: "herozhou工巧"
---

setImmediate和setTimeout（）是相似的，但取决于它们何时被调用，以不同的方式运行。

 <!--more-->

* process.nextTick()： 不在event loop的任何阶段执行，而是在各个阶段切换的中间执行,即从一个阶段切换到下个阶段前执行

* setImmediate： 只在check阶段执行


## setImmediate() vs setTimeout() 谁先执行？
setImmediate和setTimeout（）是相似的，但取决于它们何时被调用，以不同的方式运行。

* setImmediate（）用于在当前的轮询阶段完成后执行脚本。
* setTimeout（）计划一个脚本，以ms为单位的最小阈值运行。
定时器的执行顺序取决于调用的上下文。 如果两者都是从主模块内部调用，那么时序将受到进程性能的限制（可能受到其他在机器上运行的应用程序的影响）。

例如，如果我们运行不在I / O周期（即主模块）内的以下脚本，那么执行两个定时器的顺序是非确定性的，因为它受过程执行的约束：
```
// timeout_vs_immediate.js

setTimeout(() => {
  console.log('timeout');
}, 0);

setImmediate(() => {
  console.log('immediate');
});
```
输出：
```
$ node timeout_vs_immediate.js
timeout
immediate

$ node timeout_vs_immediate.js
immediate
timeout
```
确实每次loop进来，都是先检查uv_run_timer的，但是由于cpu工作耗费时间，比如第一次获取的hrtime为0
那么setTimeout(cb, 1)，超时时间就是loop->time = 1(ms，node定时器精确到1ms，但是hrtime是精确到纳秒级别的)
所以第一次loop进来的时候就有两种情况：

1.由于第一次loop前的准备耗时超过1ms，当前的loop->time >=1 ，则uv_run_timer生效，timeout先执行
2.由于第一次loop前的准备耗时小于1ms，当前的loop->time = 0，则本次loop中的第一次uv_run_timer不生效，那么io_poll后先执行uv_run_check，即immediate先执行，然后等close cb执行完后，继续执行uv_run_timer


但是，如果在I / O周期内移动这两个调用，则立即执行 ```immediate``` 回调：
```
// timeout_vs_immediate.js
const fs = require('fs');

fs.readFile(__filename, () => {
  setTimeout(() => {
    console.log('timeout');
  }, 0);
  setImmediate(() => {
    console.log('immediate');
  });
});
```
输出：
```
$ node timeout_vs_immediate.js
immediate
timeout

$ node timeout_vs_immediate.js
immediate
timeout
```
使用 ```setImmediate（）``` 而不是 ```setTimeout（）``` 的主要优点是 ```setImmediate（）``` 将始终在任何定时器之前执行（如果在I / O周期内进行调度），而与定时器的数量无关。

一下运行基于```uv_run(env.event_loop(), UV_RUN_DEFAULT);``` 以 ```UV_RUN_DEFAULT``` 模式运行。
由于这里的 ```setTimeout()``` 和 ```setImmediate()``` 的注册是在 ```readFile``` 的回调执行时设置的
。所以必然的，在 ```readFile``` 的回调执行前的每一次event loop进来的 ```uv_run_timer``` 都不会有超时事件触发
那么当readFile执行完毕，```uv__epoll_pwait（）``` 收到监听的fd的事件完成后，执行了该回调，此时

1.setTimeout 注册
2.setImmediate 注册
3.由于readFile的回调执行完毕并且无其他事件，那么就会从 ```uv__io_poll``` 中出来，此时立即执行 ```uv__run_check（）``` ，所以 ```setImmediate（）``` 的回调执行
4.最后的判断模式为 ```UV_RUN_DEFAULT``` 模式 ,继续下次循环，更新时间，执行 ```uv_run_timer（）``` 检查 ```timeout``` ，执行回调
所以你会发现，在I/O回调中注册的两者，永远都是 ```setImmediate（）``` 先执行

