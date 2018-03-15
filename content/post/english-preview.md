---
title: "自底向上 —— 事件循环的原理"
date: 2017-10-13T15:43:48+08:00
lastmod: 2017-10-13T15:43:48+08:00
draft: false
tags: ["Node.js","Node.js事件循环"]
categories: ["Node.js源码分析"]
author: "herozhou工巧"
---

这篇文章主要讲了 Node 中 事件循环的原理，以自底向上的角度解析。

<!--more-->

# 自底向上 —— 事件循环的原理
## 初始化循环队列 —— uv_default_loop
还记得第一章我们的 ```Start``` 吗？
```c
// node-v8.9.0/src/node.cc 

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
```
 ```Start``` 调用了函数```uv_default_loop()```是```libuv```库中一个函数：
```c
// node-v8.9.0/deps/uv/src/unix/uv-common.c

uv_loop_t* uv_default_loop(void) {
  if (default_loop_ptr != NULL)
    return default_loop_ptr;

  if (uv_loop_init(&default_loop_struct))
    return NULL;

  default_loop_ptr = &default_loop_struct;
  return default_loop_ptr;
}

```
它会初始化 ```uv``` 库本身以及其中的 ```default_loop_struct``` ，并返回一个指向它的指针 ```default_loop_ptr``` 。```default_loop_struct``` 结构体包含了默认的事件循环队列。
这里先不继续往下讲。我们明确几个概念。
.```uv_loop_init```初始化事件循环队列
``` 
 ...
  loop->nfds = 0;
  loop->watchers = NULL;
  loop->nwatchers = 0;
  QUEUE_INIT(&loop->watcher_queue);
  ...
```
做了一系列初始化将观察者队列插入队列中.
* watcher_queue：I/O 观察者链表
* watchers：是一个 ```uv__io_t``` 类型的二级指针。这里维护的是一个 I/O 观察者映射表(实际是以fd为下标索引的数组)。
* nwatchers：```watchers``` 数组的长度，因为是堆分配的动态数组，所以需要维护数组的长度。
* nfds：监听了多少个fd，不同于 ```nwatchers``` ，因为 ```watchers``` 里面很多元素是空的。

### 观察者结构 uv__io_t
```
typedef struct uv__io_s uv__io_t;

struct uv__io_s {
  uv__io_cb cb;
  void* pending_queue[2];
  void* watcher_queue[2];
  unsigned int pevents; /* Pending event mask i.e. mask at next tick. */
  unsigned int events;  /* Current event mask. */
  int fd;
  UV_IO_PRIVATE_PLATFORM_FIELDS
};
```
* fd：文件描述符，操作系统对进程监听的网络端口、或者打开文件的一个标记
* cb：回调函数，当相应的 I/O 观察者监听的事件被激活之后，被libuv事件循环调用的回调函数
* pevents：等待的事件
* events：交给libuv的事件循环进行监听的事件。

## 事件循环入口 —— Start
接下来看第一个重载 ```Start``` 函数,它包装了一下传进来的时间循环队列指针 ```event_loop``` 并传进第二个重载 ```Start```函数，在第一章中漏了事件循环的代码，这里贴出来:
```c
// node-v8.9.0/src/node.cc 

inline int Start(uv_loop_t* event_loop,
                 int argc, const char* const* argv,
                 int exec_argc, const char* const* exec_argv) {
        
    IsolateData isolate_data(isolate, event_loop,allocator.zero_fill_field());
    exit_code = Start(isolate, &isolate_data, argc, argv, exec_argc, exec_argv);
}


inline int Start(Isolate* isolate, IsolateData* isolate_data,
                 int argc, const char* const* argv,
                 int exec_argc, const char* const* exec_argv) {
                 
  HandleScope handle_scope(isolate);
  Local<Context> context = Context::New(isolate);
  Context::Scope context_scope(context);
  Environment env(isolate_data, context);


  env.set_trace_sync_io(trace_sync_io);

  {
    SealHandleScope seal(isolate);
    bool more;
    //性能分析开始
    PERFORMANCE_MARK(&env, LOOP_START);
    do {
      uv_run(env.event_loop(), UV_RUN_DEFAULT);

      v8_platform.DrainVMTasks();

      more = uv_loop_alive(env.event_loop());
      if (more)
        continue;

      EmitBeforeExit(&env);

      // Emit `beforeExit` if the loop became alive either after emitting
      // event, or after running some callbacks.
      more = uv_loop_alive(env.event_loop());
    } while (more == true);
    //性能分析结束
    PERFORMANCE_MARK(&env, LOOP_EXIT);
  }

  env.set_trace_sync_io(false);

  const int exit_code = EmitExit(&env);
  RunAtExit(&env);
  uv_key_delete(&thread_local_env);

  v8_platform.DrainVMTasks();
  return exit_code;
}

}
```
核心是```uv_run(env.event_loop(), UV_RUN_DEFAULT);```函数，这里将当前运行环境中的事件循环队列和标志 ```UV_RUN_DEFAULT``` 传入了 ```uv_run``` 函数，这个标志指示事件循环将以默认的模式运行。
首先介绍一下 [libuv文档](http://docs.libuv.org/en/v1.x/loop.html) 对其中几个重要函数的定义：
* int uv_run(uv_loop_t* loop, uv_run_mode mode)  
  这个函数会以几个不同的模式运行事件循环

* * UV_RUN_DEFAULT: Runs the event loop until there are no more  
  运行事件循环，直到没有更多的活动和引用的句柄或请求。 如果uv_stop（）被调用并且仍然有活动的句柄或请求，则返回非零值。 在其他情况下返回零。
* * UV_RUN_ONCE: Poll for i/o once. Note that this function blocks  
   以Poll方式运行I/O一次。请注意，如果没有待处理的回调，该功能将阻塞。 完成后返回零（没有活动的句柄或请求），如果需要更多的回调，则返回非零（意味着您应该在将来再次运行事件循环）
* * UV_RUN_NOWAIT: 
  对 I/O 进行轮询，但是如果没有待处理的回调，则不会阻塞。 如果完成（没有活动的句柄或请求），返回零，或者如果需要更多回调，则返回非零（意味着您应该在将来再次运行事件循环）。
* int uv_loop_alive(const uv_loop_t* loop)  
  如果循环中还有活动句柄或请求，则返回非零值

* void uv_stop(uv_loop_t* loop)  
  停止事件循环，使uv_run（）尽快结束。 这将不会比下一个循环迭代发生。 如果在阻塞I/O之前调用此函数，则在此迭代中循环将不会阻塞I/O。
* void uv_update_time(uv_loop_t* loop)  
  更新事件循环的“现在”的概念。 Libuv在事件循环开始时缓存当前时间，以减少与时间相关的系统调用次数。通常不需要调用此函数，除非您有更长时间的阻塞事件循环的回调，其中“更长”有点主观，但可能在一毫秒或更多的数量级。 

## 执行事件循环 —— uv_run
在 uv_run 函数中，会维护一系列的监视器：
```
typedef struct uv_loop_s uv_loop_t;
typedef struct uv_err_s uv_err_t;
typedef struct uv_handle_s uv_handle_t;
typedef struct uv_stream_s uv_stream_t;
typedef struct uv_tcp_s uv_tcp_t;
typedef struct uv_udp_s uv_udp_t;
typedef struct uv_pipe_s uv_pipe_t;
typedef struct uv_tty_s uv_tty_t;
typedef struct uv_poll_s uv_poll_t;
typedef struct uv_timer_s uv_timer_t;
typedef struct uv_prepare_s uv_prepare_t;
typedef struct uv_check_s uv_check_t;
typedef struct uv_idle_s uv_idle_t;
typedef struct uv_async_s uv_async_t;
typedef struct uv_process_s uv_process_t;
typedef struct uv_fs_event_s uv_fs_event_t;
typedef struct uv_fs_poll_s uv_fs_poll_t;
typedef struct uv_signal_s uv_signal_t;

```
这些监视器都有对应着一种异步操作，它们通过 uv_TYPE_start，来注册事件监听以及相应的回调。

在 uv_run 执行过程中，它会不断的检查这些队列中是或有 pending 状态的事件，有则触发:
```c
// node-v8.9.0/deps/uv/src/unix/core.c
 
int uv_run(uv_loop_t* loop, uv_run_mode mode) {
  int timeout;
  int r;
  int ran_pending;

  // 如果循环中还有活动句柄或请求，返回true
  r = uv__loop_alive(loop);
  if (!r)
    uv__update_time(loop);

  while (r != 0 && loop->stop_flag == 0) {
    // 使用Linux下的高精度Timer hrtime更新loop->time,即event loop的时间戳
    uv__update_time(loop);
    // 执行判断当前loop->time下有无到期的Timer定时器 
    uv__run_timers(loop);
    // 判断当前的pending_queue是否有事件待处理,并且一次将&loop->pending_queue中的uv__io_t对应的cb全部拿出来执行 
    ran_pending = uv__run_pending(loop);
    // 一次将&loop->idle_handles中的idle_cd全部执行完毕(如果存在的话) 
    uv__run_idle(loop);
    // 一次将&loop->prepare_handles中的prepare_cb全部执行完毕(如果存在的话)
    uv__run_prepare(loop);

    timeout = 0;
    //如果是UV_RUN_ONCE的模式,并且pending_queue队列为空,或者采用UV_RUN_DEFAULT(在一个loop中处理所有事件),
    //则将timeout参数置为最近的一个定时器的timeout时间,防止在uv_io_poll中阻塞住无法进入超时的定时器中
    if ((mode == UV_RUN_ONCE && !ran_pending) || mode == UV_RUN_DEFAULT)
      timeout = uv_backend_timeout(loop);
    
    //进入I/O处理的函数(重点分析的部分),此处挂载timeout是为了防止在uv__io_poll中陷入阻塞无法执行定时器;
    //并且对于模式为UV_RUN_NOWAIT的uv_run执行,timeout为0可以保证其立即跳出uv__io_poll,达到了非阻塞调用的效果
    uv__io_poll(loop, timeout);
    
    // 一次将&loop->check_handles中的check_cb全部执行完毕(如果存在的话)
    uv__run_check(loop);
    // 执行结束时的资源释放,loop->closing_handles指针指向NULL
    uv__run_closing_handles(loop);

    if (mode == UV_RUN_ONCE) {
      /* UV_RUN_ONCE implies forward progress: at least one callback must have
       * been invoked when it returns. uv__io_poll() can return without doing
       * I/O (meaning: no callbacks) when its timeout expires - which means we
       * have pending timers that satisfy the forward progress constraint.
       *
       * UV_RUN_NOWAIT makes no guarantees about progress so it's omitted from
       * the check.
       */
       /* （译）
       UV_RUN_ONCE: 意味着前进进程：返回时至少必须调用一个回调。 当它的超时到期时，
       uv__io_poll（）可以返回而不做I / O（意思是：没有回调)
       这意味着我们有等待的定时器满足前进进程约束。
       
       UV_RUN_NOWAIT: 不保证进度，所以从检查中省略。
       */
       
      //如果是UV_RUN_ONCE模式,继续更新当前event loop的时间戳
      uv__update_time(loop);
      //执行timers,判断是否有已经到期的timer
      uv__run_timers(loop);
    }
    
    // 那么如果若它还是存活的，它就会开始下一次迭代
    r = uv__loop_alive(loop);
    // 如果不是 UV_RUN_DEFAULT 模式启动，就退出
    if (mode == UV_RUN_ONCE || mode == UV_RUN_NOWAIT)
      break;
  }

  /* The if statement lets gcc compile it to a conditional store. Avoids
   * dirtying a cache line.
   */
   	//标记当前的stop_flag为0,表示当前的loop执行完毕
  if (loop->stop_flag != 0)
    loop->stop_flag = 0;

  return r;
}
```
### 循环过程详解
![image](http://docs.libuv.org/en/latest/_images/loop_iteration.png)
1. 事件循环中的“现在时间（now）”被更新。事件循环会在一次循环迭代开始的时候缓存下当时的时间，用于减少与时间相关的系统调用次数。
2. 如果事件循环仍是存活（alive）的，那么迭代就会开始，否则循环会立刻退出。如果一个循环内包含存活的可引用句柄，存活的请求或正在关闭的句柄，那么则认为该循环是存活的。
3. 执行定时器（due timers）。所有在循环的“现在时间”之前设定的定时器的回调都将在这个时候得到执行。
4. 执行等待中回调（pending callbacks）。正常情况下，所有的 ```I/O``` 回调都会在轮询 ```I/O``` 后立刻被调用。但是有些情况下，回调可能会被推迟至下一次循环迭代中再执行。任何上一次循环中被推迟的回调，都将在这个时候得到执行。
5. 执行闲置句柄回调（idle handle callbacks）。尽管它有个不怎么好听的名字，但只要这些闲置句柄是激活的，那么在每次循环迭代中它们都会执行。
6. 执行预备回调（prepare handle）。预备回调会在循环为 ```I/O``` 阻塞前被调用。
7. 开始计算轮询超时（poll timeout）。在为 ```I/O``` 阻塞前，事件循环会计算它即将会阻塞多长时间。以下为计算该超时的规则：
    *  如果循环带着 ```UV_RUN_NOWAIT``` 标识执行，那么超时将会是 0 。
    * 如果循环即将停止（uv_stop() 已在之前被调用），那么超时将会是 0 。
    * 如果循环内没有激活的句柄和请求，那么超时将会是 0 。
    * 如果循环内有激活的闲置句柄，那么超时将会是 0 。
    * 如果有正在等待被关闭的句柄，那么超时将会是 0 。
    * 如果不符合以上所有，那么该超时将会是循环内所有定时器中最早的一个超 时时间，如果没有任何一个激活的定时器，那么超时将会是无限长（infinity）。
8. 事件循环为 ```I/O``` 阻塞。此时事件循环将会为 ```I/O``` 阻塞，持续时间为上一步中计算所得的超时时间。所有与 ```I/O``` 相关的句柄都将会监视一个指定的文件描述符，等待一个其上的读或写操作来激活它们的回调。
9. 执行检查句柄回调（check handle callbacks）。在事件循环为 ```I/O``` 阻塞结束后，检查句柄的回调将会立刻执行。检查句柄本质上是预备句柄的对应物（counterpart）。
10. 执行关闭回调（close callbacks）。如果一个句柄通过调用 ```uv_close()``` 被关闭，那么这将会调用关闭回调。
尽管在为 ```I/O``` 阻塞后可能并没有 ```I/O``` 回调被触发，但是仍有可能这时已经有一些定时器已经超时。若事件循环是以 11.  ```UV_RUN_ONCE```  标识执行，那么在这时这些超时的定时器的回调将会在此时得到执行。
12. 迭代结束。如果循环以 ```UV_RUN_NOWAIT``` 或 ```UV_RUN_ONCE``` 标识执行，迭代便会结束，并且 ```uv_run()``` 将会返回。如果循环以  ```UV_RUN_DEFAULT``` 标识执行，那么如果若它还是存活的，它就会开始下一次迭代，否则结束。

重要：虽然 ```libuv``` 的异步文件 ```I/O``` 操作是通过线程池实现的，但是网络 ```I/O``` 总是在单线程中执行的。

> 注意：虽然在不同平台上使用的轮询机制不同，但 ```libuv``` 的执行模型在不同平台下都是保持一致。
[libuv 文档](http://docs.libuv.org/en/latest/design.html)

## timer阶段 —— uv__run_timers
计时器指定timeout，之后可以执行提供的回调，而不是人们希望执行的确切时间。定时器回调会在指定的时间过后按照预定的时间运行;但是，操作系统调度或其他回调的运行可能会延迟它们。
.```uv__run_timers```，跑完已经执行的所有timer任务。

```c
// node-v8.9.0/deps/uv/src/unix/timer.c

void uv__run_timers(uv_loop_t* loop) {
  struct heap_node* heap_node;
  uv_timer_t* handle;
 
  for (;;) {
    // 从一个堆里面取出delay最小的任务。 
    heap_node = heap_min((struct heap*) &loop->timer_heap);
    if (heap_node == NULL)
      break;
 
    handle = container_of(heap_node, uv_timer_t, heap_node);
    // 判断delay的任务是不是可以执行了（判断delay的执行时间与当前时间的大小）。 
    if (handle->timeout > loop->time)
      break;
 
    uv_timer_stop(handle);
    // 如果是需要重复执行的timer，就再次add一个timer。 
    uv_timer_again(handle);
    // 执行回调 
    handle->timer_cb(handle);
  }
}
```
> 注意：在技术上，轮询阶段控制何时执行定时器。

## I/O callbacks阶段 —— uv__run_pending
此阶段对某些系统操作（如TCP错误类型）执行回调。 例如，如果尝试连接时TCP套接字收到ECONNREFUSED，则某些* nix系统要等待报告错误。 这将排队在I / O回调阶段执行。
```c
// node-v8.9.0/deps/uv/src/unix/core.c

static int uv__run_pending(uv_loop_t* loop) {
  QUEUE* q;
  QUEUE pq;
  uv__io_t* w;
 
  if (QUEUE_EMPTY(&loop->pending_queue))
    return 0;
 
  QUEUE_MOVE(&loop->pending_queue, &pq);
 
  while (!QUEUE_EMPTY(&pq)) {
    q = QUEUE_HEAD(&pq);
    QUEUE_REMOVE(q);
    QUEUE_INIT(q);
    w = QUEUE_DATA(q, uv__io_t, pending_queue);
    w->cb(loop, w, POLLOUT);
  }
 
  return 1;
}
```
## idle, prepare 阶段
```
uv__run_idle(loop);
uv__run_prepare(loop);
```

## 事件循环核心函数 —— uv__io_poll
接下来是另外一个核心函数，```uv__io_poll```。以linux-core.c为例（其他实现同理）：
```
// node-v8.9.0/src/deps/src/unix/linux-core.c

void uv__io_poll(uv_loop_t* loop, int timeout) {

...

  if (loop->nfds == 0) {
    assert(QUEUE_EMPTY(&loop->watcher_queue));
    return;
  }
   
  // 遍历观察者队列
  while (!QUEUE_EMPTY(&loop->watcher_queue)) {
    q = QUEUE_HEAD(&loop->watcher_queue);
    QUEUE_REMOVE(q);
    QUEUE_INIT(q);

    // 取出观察者 小w
    w = QUEUE_DATA(q, uv__io_t, watcher_queue);
    assert(w->pevents != 0);
    assert(w->fd >= 0);
    assert(w->fd < (int) loop->nwatchers);
   
    // 将小w的待处理事件和fd文件描述符赋值给e
    e.events = w->pevents;
    e.data = w->fd;

    // 如果待处理事件为0，为增加模式，否则为修改模式
    if (w->events == 0)
      op = UV__EPOLL_CTL_ADD;
    else
      op = UV__EPOLL_CTL_MOD;

    /* XXX Future optimization: do EPOLL_CTL_MOD lazily if we stop watching
     * events, skip the syscall and squelch the events after epoll_wait().
     */

    // 添加fd给事件轮询机制
    if (uv__epoll_ctl(loop->backend_fd, op, w->fd, &e)) {
      if (errno != EEXIST)
        abort();

      assert(op == UV__EPOLL_CTL_ADD);

      /* We've reactivated a file descriptor that's been watched before. */
      // (译)我们已经重新激活了之前观看过的文件描述符。
      if (uv__epoll_ctl(loop->backend_fd, UV__EPOLL_CTL_MOD, w->fd, &e))
        abort();
    }
    
    // 将待处理的事件赋值给事件
    w->events = w->pevents;
  }

  sigmask = 0;
  if (loop->flags & UV_LOOP_BLOCK_SIGPROF) {
    sigemptyset(&sigset);
    sigaddset(&sigset, SIGPROF);
    sigmask |= 1 << (SIGPROF - 1);
  }

  // 计时
  assert(timeout >= -1);
  base = loop->time;
  count = 48; /* Benchmarks suggest this gives the best throughput. */
  real_timeout = timeout;

  // 进入事件循环死循环
  for (;;) {
    /* See the comment for max_safe_timeout for an explanation of why
     * this is necessary.  Executive summary: kernel bug workaround.
     */
    // 最大超时时间
    if (sizeof(int32_t) == sizeof(long) && timeout >= max_safe_timeout)
      timeout = max_safe_timeout;

    if (sigmask != 0 && no_epoll_pwait != 0)
      if (pthread_sigmask(SIG_BLOCK, &sigset, NULL))
        abort();

    if (no_epoll_wait != 0 || (sigmask != 0 && no_epoll_pwait == 0)) {

      // 使用uv__epoll_pwait在指定的时间内等待哪些fd有事件到来
      nfds = uv__epoll_pwait(loop->backend_fd,
                             events,
                             ARRAY_SIZE(events),
                             timeout,
                             sigmask);
      if (nfds == -1 && errno == ENOSYS)
        no_epoll_pwait = 1;
    } else {
      nfds = uv__epoll_wait(loop->backend_fd,
                            events,
                            ARRAY_SIZE(events),
                            timeout);
      if (nfds == -1 && errno == ENOSYS)
        no_epoll_wait = 1;
    }

    if (sigmask != 0 && no_epoll_pwait != 0)
      if (pthread_sigmask(SIG_UNBLOCK, &sigset, NULL))
        abort();

    /* Update loop->time unconditionally. It's tempting to skip the update when
     * timeout == 0 (i.e. non-blocking poll) but there is no guarantee that the
     * operating system didn't reschedule our process while in the syscall.
     */

    // (译)无条件更新循环时间。 当 timeout == 0（即非阻塞轮询）时，很容易跳过更新，
    // 但不能保证操作系统在系统调用时不重新调度我们的进程。
    SAVE_ERRNO(uv__update_time(loop));

    // 如果没有监测到有事件发生
    if (nfds == 0) {
      assert(timeout != -1);

      if (timeout == 0)
        return;

      /* We may have been inside the system call for longer than |timeout|
       * milliseconds so we need to update the timestamp to avoid drift.
       */
      goto update_timeout;
    }

    // 如果发生错误
    if (nfds == -1) {
      if (errno == ENOSYS) {
        /* epoll_wait() or epoll_pwait() failed, try the other system call. */
        assert(no_epoll_wait == 0 || no_epoll_pwait == 0);
        continue;
      }

      if (errno != EINTR)
        abort();

      if (timeout == -1)
        continue;

      if (timeout == 0)
        return;

      /* Interrupted by a signal. Update timeout and poll again. */
      goto update_timeout;
    }

    have_signals = 0;
    nevents = 0;

    assert(loop->watchers != NULL);
    loop->watchers[loop->nwatchers] = (void*) events;
    loop->watchers[loop->nwatchers + 1] = (void*) (uintptr_t) nfds;

    // 遍历所有的epoll事件 
    for (i = 0; i < nfds; i++) {

      // 取出这个fd文件操作符
      pe = events + i;
      fd = pe->data;

      /* Skip invalidated events, see uv__platform_invalidate_fd */
      // 如果fd无效，continue循环
      if (fd == -1)
        continue;

      assert(fd >= 0);
      assert((unsigned) fd < loop->nwatchers);

      // 取出观察者
      w = loop->watchers[fd];

      // 
      if (w == NULL) {
        /* File descriptor that we've stopped watching, disarm it.
         *
         * Ignore all errors because we may be racing with another thread
         * when the file descriptor is closed.
         */

        // （译）我们已经停止监视的文件描述符，解除它的关闭(重新添加一次)。
        //忽略所有错误，因为当文件描述符关闭时，我们可能正在与另一个线程竞争。
        uv__epoll_ctl(loop->backend_fd, UV__EPOLL_CTL_DEL, fd, pe);
        continue;
      }

      /* Give users only events they're interested in. Prevents spurious
       * callbacks when previous callback invocation in this loop has stopped
       * the current watcher. Also, filters out events that users has not
       * requested us to watch.
       */

      // （译）为用户提供他们感兴趣的事件。防止在此循环中先前的回调调用停止当前观察器时发生虚假回调。
      // 此外，过滤出用户没有要求我们观看的事件。
      pe->events &= w->pevents | POLLERR | POLLHUP;

      /* Work around an epoll quirk where it sometimes reports just the
       * EPOLLERR or EPOLLHUP event.  In order to force the event loop to
       * move forward, we merge in the read/write events that the watcher
       * is interested in; uv__read() and uv__write() will then deal with
       * the error or hangup in the usual fashion.
       *
       * Note to self: happens when epoll reports EPOLLIN|EPOLLHUP, the user
       * reads the available data, calls uv_read_stop(), then sometime later
       * calls uv_read_start() again.  By then, libuv has forgotten about the
       * hangup and the kernel won't report EPOLLIN again because there's
       * nothing left to read.  If anything, libuv is to blame here.  The
       * current hack is just a quick bandaid; to properly fix it, libuv
       * needs to remember the error/hangup event.  We should get that for
       * free when we switch over to edge-triggered I/O.
       */

  //  解决epoll问题，它有时只报告EPOLLERR或EPOLLHUP事件。 为了强制事件循环前进，我们合并了观察者感兴趣的读/写事件; 
  //   uv__read（）和uv__write（）将以通常的方式处理错误或挂断。
  //  注意：当epoll报告EPOLLIN | EPOLLHUP时，用户读取可用数据，调用uv_read_stop（），然后再次调用uv_read_start（）。 
  //  到那时，libuv已经忘记了挂断，内核不会再次报告EPOLLIN，因为没有什么可读的。

      if (pe->events == POLLERR || pe->events == POLLHUP)
        pe->events |= w->pevents & (POLLIN | POLLOUT | UV__POLLPRI);

      if (pe->events != 0) {
        /* Run signal watchers last.  This also affects child process watchers
         * because those are implemented in terms of signal watchers.
         */
        // 如果是signal事件，标志位设为1
        if (w == &loop->signal_io_watcher)
          have_signals = 1;
        else
          // 调用观察者结构体中的回调函数
          w->cb(loop, w, pe->events);

        nevents++;
      }
    }

    if (have_signals != 0)
      // 调用singal观察者的回调函数
      loop->signal_io_watcher.cb(loop, &loop->signal_io_watcher, POLLIN);

    loop->watchers[loop->nwatchers] = NULL;
    loop->watchers[loop->nwatchers + 1] = NULL;

    if (have_signals != 0)
      return;  /* Event loop should cycle now so don't poll again. */

    if (nevents != 0) {
      if (nfds == ARRAY_SIZE(events) && --count != 0) {
        /* Poll for more events but don't block this time. */
        timeout = 0;
        continue;
      }
      return;
    }

    if (timeout == 0)
      return;

    if (timeout == -1)
      continue;
// 更新超时时间
update_timeout:
    assert(timeout > 0);

    real_timeout -= (loop->time - base);
    if (real_timeout <= 0)
      return;

    timeout = real_timeout;
  }
}
```
代码很长但逻辑很简单：
首先遍历 ```loop->watcher_queue``` ，取出所有io观察者.
调用 ```uv__epoll_ctl()```，把 ```w->fd```（io观察者对应的fd）注册给linux系统的 ```epoll``` 机制，```uv__epoll_pwait()```时就监听对应的fd. 
实现这个功能的函数是：```uv__epoll_ctl```: 根据不同的模式添加，删除或更新文件描述符和轮询事件。
不同的模式有：
*  ```UV__EPOLL_CTL_ADD``` : 更改与目标文件描述符fd关联的事件。
*  ```UV__EPOLL_CTL_MOD``` : 在epoll文件描述符epfd中修改目标文件描述符fd
*  ```UV__EPOLL_CTL_DEL``` : 从epoll文件描述符epfd中删除目标文件描述符fd

然后进入死循环 调用 ```uv__epoll_ctl``` 执行轮询操作确定哪些文件描述符有事件待处理。```timeout``` 参数指定如果没有事件待处理，等待的时间量。将 ```timeout``` 设置为0可以立即返回。将超时设置为-1指定无限超时。其他非零的正值指定以毫秒为单位的等待时间。

如果 ```uv__epoll_pwait``` 返回了所有的 ```epoll``` 事件 ，遍历访问事件的 ```fd``` ，这个时候 ```loop->watchers``` 映射表就起到作用了，通过 fd 拿出对应的 I/O 观察者 —— w，调用 ```w->cb()```执行回调函数。


## check 阶段 —— uv__run_check
```
uv__run_check
```
这个阶段允许在poll阶段结束后立即执行回调。 如果轮询阶段变得空闲并且脚本已经用 ```setImmediate（） ```排队，则事件循环可以继续到poll阶段而不是等待。

```setImmediate（）``` 实际上是一个特殊的定时器，它在事件循环的一个单独的阶段中运行。 它使用一个 ```libuv API``` 来调度轮询阶段完成后执行的回调。

通常，随着代码的执行，事件循环将最终进入轮询阶段，在那里它将等待传入连接，请求等。但是，如果使用 ```setImmediate（）``` 计划了回调，并且轮询阶段变为空闲， 将结束并继续进行检查阶段，而不是等待poll事件。
## close callbacks 阶段 —— uv__run_closing_handles
如果 ```socket``` 或 ```handle``` 突然关闭（例如 ```socket.destroy（）``` ），则在此阶段将触发“close”事件。 否则，它将通过 ```process.nextTick（）```触发。
```c
static void uv__run_closing_handles(uv_loop_t* loop) {
  uv_handle_t* p;
  uv_handle_t* q;

  p = loop->closing_handles;
  loop->closing_handles = NULL;

  while (p) {
    q = p->next_closing;
    uv__finish_close(p);
    p = q;
  }
}
```

# 总结
Node主线程是js执行线程，是不会处于block（阻塞）状态的，除非使用 ```fs.readFileSync``` 等 ```node api``` 里的同步方法，或者死循环。

Node.js使用的是 ```Reactor``` 模式，凡是遇到需要block的地方，要么使用系统的异步API（网络请求），要么扔到线程池里（文件读写）去做，主线程接着处理其他请求。
所以多请求并发的时候，Node.js本质上是在排队，但是每个人等待的时间都很短，除非每个请求都耗费大量CPU时间。所以Node.js这种 ```Reactor``` 模式的 ```Server``` 对于 ```CPU``` 利用是相对高效的，避免了线程切换导致的的 ```CPU``` 上下文切换。
``` 
┌───────────────────────┐
┌─>│        timers         │
│  └──────────┬────────────┘
│  ┌──────────┴────────────┐
│  │     I/O callbacks     │
│  └──────────┬────────────┘
│  ┌──────────┴────────────┐
│  │     idle, prepare     │
│  └──────────┬────────────┘      ┌───────────────┐
│  ┌──────────┴────────────┐      │   incoming:   │
│  │         poll          │<─────┤  connections, │
│  └──────────┬────────────┘      │   data, etc.  │
│  ┌──────────┴────────────┐      └───────────────┘
│  │        check          │
│  └──────────┬────────────┘
│  ┌──────────┴────────────┐
└──┤    close callbacks    │
   └───────────────────────┘
```
每个阶段都有一个执行回调的FIFO队列。虽然每个阶段都是以自己的方式特殊的，但通常当事件循环进入给定阶段时，它将执行特定于该阶段的任何操作，然后在该阶段的队列中执行回调，直到队列耗尽或回调的最大数量已执行。当队列耗尽或达到回调限制时，事件循环将移至下一个阶段，依此类推。

* timers:此阶段执行由 ```setTimeout（）``` 和 ```setInterval（）``` 调度的回调。
* I/O callbacks: 执行几乎所有的回调函数，除了关闭回调函数，定时器调度函数和```setImmediate（）```.
* idle, prepare : 只在Node内部使用
* poll： 检索新的I/O事件;Node将在适当的时候阻塞。
* check ： ```setImmediate（）``` 回调在这里被调用。
* close callbacks：例如 ```socket.on（'close'，...）``` 。


# 精选面试题

## setTimeout(cb, 0) === setTimeout(cb, 1) ？
其实是一样的，看下Node对Timer的实现
```
function createSingleTimeout(callback, after, args) {
  after *= 1; // coalesce to number or NaN
  if (!(after >= 1 && after <= TIMEOUT_MAX)) {
    if (after > TIMEOUT_MAX) {
      process.emitWarning(`${after} does not fit into` +
                          ' a 32-bit signed integer.' +
                          '\nTimeout duration was set to 1.',
                          'TimeoutOverflowWarning');
    }
    after = 1; // schedule on next tick, follows browser behavior
  }

  var timer = new Timeout(after, callback, args);
  if (process.domain)
    timer.domain = process.domain;

  active(timer);

  return timer;
}
```
可以看到 ```<1``` 的值被转化为1，浏览器中也是这样实现的。


