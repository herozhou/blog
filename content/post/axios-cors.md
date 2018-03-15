---
title: "axios跨域问题"
date: 2017-10-17T01:37:56+08:00
lastmod: 2017-10-17T01:37:56+08:00
draft: false
tags: ["Vue.js","CORS"]
categories: ["CORS"]
author: "herozhou工巧"
---

在 vue 项目中使用 axios 发出跨域请求，在设置 ```res.setHeader("Access-Control-Allow-Origin", "*");``` 之后依然提示跨域无法正常访问。

 <!--more-->

# 问题描述
在 vue 项目中使用 axios 发出跨域请求，在设置 ```res.setHeader("Access-Control-Allow-Origin", "*");``` 之后依然提示跨域无法正常访问。

没设置之前：
![image.png](http://upload-images.jianshu.io/upload_images/6073656-d5958a09ce77169f.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

但是查看网络请求
![image.png](http://upload-images.jianshu.io/upload_images/6073656-6510ff5c0550676a.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

发现竟然发出了一次 options请求，这是为什么呢。

下面是小葵花妈妈课堂补课时间：

# HTTP访问控制（CORS）

当一个资源从与该资源本身所在的服务器不同的域或端口请求一个资源时，资源会发起一个跨域 HTTP 请求。
 
比如，站点 ```http://domain-a.com``` 的某 HTML 页面通过 <img> 的 src 请求 ```http://domain-b.com/image.jpg```。网络上的许多页面都会加载来自不同域的CSS样式表，图像和脚本等资源。
 
出于安全原因，浏览器限制从脚本内发起的跨源HTTP请求。 例如，```XMLHttpRequest ```和 ```Fetch API ```遵循同源策略。 这意味着使用这些API的Web应用程序只能从加载应用程序的同一个域请求HTTP资源，除非使用```CORS```头文件。

![image](https://mdn.mozillademos.org/files/14295/CORS_principle.png)

跨域资源共享（ CORS ）机制允许 Web 应用服务器进行跨域访问控制，从而使跨域数据传输得以安全进行。浏览器支持在 ```API``` 容器中（例如 XMLHttpRequest 或 Fetch ）使用 ```CORS```，以降低跨域 ```HTTP``` 请求所带来的风险。

# 跨域资源共享标准

跨域资源共享标准新增了一组 ```HTTP``` 首部字段，允许服务器声明哪些源站有权限访问哪些资源。另外，规范要求，对那些可能对服务器数据产生副作用的 ```HTTP``` 请求方法（特别是 ```GET``` 以外的 ```HTTP``` 请求，或者搭配某些 MIME 类型的 ```POST``` 请求），浏览器必须首先使用 ```OPTIONS``` 方法发起一个预检请求（```preflight request```），从而获知服务端是否允许该跨域请求。服务器确认允许之后，才发起实际的 HTTP 请求。在预检请求的返回中，服务器端也可以通知客户端，是否需要携带身份凭证（包括 ```Cookies``` 和 ```HTTP``` 认证相关数据）。

跨域资源共享标准（ cross-origin sharing standard ）允许在下列场景中使用跨域 ```HTTP``` 请求：

* 前文提到的由 [XMLHttpRequest](https://developer.mozilla.org/zh-CN/docs/Web/API/XMLHttpRequest) 或 [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) 发起的跨域 HTTP 请求。
* Web 字体 (CSS 中通过 @font-face 使用跨域字体资源), [因此，网站就可以发布 TrueType 字体资源，并只允许已授权网站进行跨站调用](http://www.webfonts.info/wiki/index.php?title=%40font-face_support_in_Firefox)。
* [WebGL 贴图](https://developer.mozilla.org/zh-CN/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL)
* 使用 [drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage) 将 Images/video 画面绘制到 canvas
* 样式表（使用 [CSSOM](https://developer.mozilla.org/en-US/docs/Web/CSS/CSSOM_View)）
* Scripts (未处理的异常)

# 若干访问控制场景

这里，我们使用三个场景来解释跨域资源共享机制的工作原理。这些例子都使用 ```XMLHttpRequest``` 对象。

## 简单请求
某些请求不会触发 [CORS](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Access_control_CORS#Preflighted_requests) 预检请求。本文称这样的请求为“简单请求”，请注意，该术语并不属于 [Fetch](https://fetch.spec.whatwg.org/) （其中定义了 CORS）规范。若请求满足所有下述条件，则该请求可视为“简单请求”：

* 使用下列方法之一：
  * GET
  * HEAD
  * POST
* Fetch 规范定义了对 [CORS 安全的首部字段集合](https://fetch.spec.whatwg.org/#cors-safelisted-request-header)，不得人为设置该集合之外的其他首部字段。该集合为：
  * Accept
  * Accept-Language
  * Content-Language
  * Content-Type （需要注意额外的限制）
  * [DPR](http://httpwg.org/http-extensions/client-hints.html#dpr)
  * [Downlink](http://httpwg.org/http-extensions/client-hints.html#downlink)
  * [Save-Data](http://httpwg.org/http-extensions/client-hints.html#save-data)
  * [Viewport-Width](Viewport-Width)
  * [Width](http://httpwg.org/http-extensions/client-hints.html#width)
* [Content-Type](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Content-Type) 的值仅限于下列三者之一：
  * text/plain
  * multipart/form-data
  * application/x-www-form-urlencoded
  
客户端和服务器之间使用 ```CORS``` 首部字段来处理跨域权限：
![image](https://mdn.mozillademos.org/files/14293/simple_req.png)

分别检视请求报文和响应报文：
```
GET /resources/public-data/ HTTP/1.1
Host: bar.other
User-Agent: Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10.5; en-US; rv:1.9.1b3pre) Gecko/20081130 Minefield/3.1b3pre
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-us,en;q=0.5
Accept-Encoding: gzip,deflate
Accept-Charset: ISO-8859-1,utf-8;q=0.7,*;q=0.7
Connection: keep-alive
Referer: http://foo.example/examples/access-control/simpleXSInvocation.html
Origin: http://foo.example


HTTP/1.1 200 OK
Date: Mon, 01 Dec 2008 00:23:53 GMT
Server: Apache/2.0.61 
Access-Control-Allow-Origin: *
Keep-Alive: timeout=2, max=100
Connection: Keep-Alive
Transfer-Encoding: chunked
Content-Type: application/xml

[XML Data]
```

第 1~10 行是请求首部。第10行 的请求首部字段 ```Origin``` 表明该请求来源于 ```http://foo.exmaple```。

第 13~22 行是来自于 ```http://bar.other``` 的服务端响应。响应中携带了响应首部字段 ```Access-Control-Allow-Origin```（第 16 行）。使用 ```Origin``` 和 ```Access-Control-Allow-Origin``` 就能完成最简单的访问控制。本例中，服务端返回的 ```Access-Control-Allow-Origin: *``` 表明，该资源可以被任意外域访问。如果服务端仅允许来自``` http://foo.example``` 的访问，该首部字段的内容如下：

```Access-Control-Allow-Origin: http://foo.example```

现在，除了 ```http://foo.example```，其它外域均不能访问该资源（该策略由请求首部中的 ```ORIGIN``` 字段定义，见第10行）。```Access-Control-Allow-Origin ```应当为 ```*``` 或者包含由 ```Origin``` 首部字段所指明的域名。


## 预检请求
与前述简单请求不同，“需预检的请求”要求必须首先使用 ```OPTIONS```   方法发起一个预检请求到服务器，以获知服务器是否允许该实际请求。"预检请求“的使用，可以避免跨域请求对服务器的用户数据产生未预期的影响。

当请求满足下述任一条件时，即应首先发送预检请求：

* 使用了下面任一 ```HTTP``` 方法：
  * PUT
  * DELETE
  * CONNECT
  * OPTIONS
  * TRACE
  * PATCH
* 人为设置了对  [CORS 安全的首部字段集合](https://fetch.spec.whatwg.org/#cors-safelisted-request-header)之外的其他首部字段。该集合为：
  * Accept
  * Accept-Language
  * Content-Language
  * Content-Type （需要注意额外的限制）
  * [DPR](http://httpwg.org/http-extensions/client-hints.html#dpr)
  * [Downlink](http://httpwg.org/http-extensions/client-hints.html#downlink)
  * [Save-Data](http://httpwg.org/http-extensions/client-hints.html#save-data)
  * [Viewport-Width](Viewport-Width)
  * [Width](http://httpwg.org/http-extensions/client-hints.html#width)
* [Content-Type](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Content-Type) 的值不属于下列之一:：
  * text/plain
  * multipart/form-data
  * application/x-www-form-urlencoded
 
```
var xhr = new XMLHttpRequest();
var url = 'http://bar.other/resources/post-here/';
var body = '<?xml version="1.0"?><person><name>Arun</name></person>';
    
  xhr.open('POST', url, true);
  xhr.setRequestHeader('X-PINGOTHER', 'pingpong');
  xhr.setRequestHeader('Content-Type', 'application/xml');
  xhr.onreadystatechange = handler;
  xhr.send(body); 
```
上面的代码使用 POST 请求发送一个请求包含了一个自定义的请求首部字段（X-PINGOTHER: pingpong）。另外，该请求的 Content-Type 为 application/xml。因此，该请求需要首先发起“预检请求”。

![image](https://mdn.mozillademos.org/files/14289/prelight.png)
```
OPTIONS /resources/post-here/ HTTP/1.1
Host: bar.other
User-Agent: Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10.5; en-US; rv:1.9.1b3pre) Gecko/20081130 Minefield/3.1b3pre
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-us,en;q=0.5
Accept-Encoding: gzip,deflate
Accept-Charset: ISO-8859-1,utf-8;q=0.7,*;q=0.7
Connection: keep-alive
Origin: http://foo.example
Access-Control-Request-Method: POST
Access-Control-Request-Headers: X-PINGOTHER, Content-Type


HTTP/1.1 200 OK
Date: Mon, 01 Dec 2008 01:15:39 GMT
Server: Apache/2.0.61 (Unix)
Access-Control-Allow-Origin: http://foo.example
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: X-PINGOTHER, Content-Type
Access-Control-Max-Age: 86400
Vary: Accept-Encoding, Origin
Content-Encoding: gzip
Content-Length: 0
Keep-Alive: timeout=2, max=100
Connection: Keep-Alive
Content-Type: text/plain
```
预检请求完成之后，发送实际请求：
```
POST /resources/post-here/ HTTP/1.1
Host: bar.other
User-Agent: Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10.5; en-US; rv:1.9.1b3pre) Gecko/20081130 Minefield/3.1b3pre
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-us,en;q=0.5
Accept-Encoding: gzip,deflate
Accept-Charset: ISO-8859-1,utf-8;q=0.7,*;q=0.7
Connection: keep-alive
X-PINGOTHER: pingpong
Content-Type: text/xml; charset=UTF-8
Referer: http://foo.example/examples/preflightInvocation.html
Content-Length: 55
Origin: http://foo.example
Pragma: no-cache
Cache-Control: no-cache

<?xml version="1.0"?><person><name>Arun</name></person>


HTTP/1.1 200 OK
Date: Mon, 01 Dec 2008 01:15:40 GMT
Server: Apache/2.0.61 (Unix)
Access-Control-Allow-Origin: http://foo.example
Vary: Accept-Encoding, Origin
Content-Encoding: gzip
Content-Length: 235
Keep-Alive: timeout=2, max=99
Connection: Keep-Alive
Content-Type: text/plain

[Some GZIP'd payload]
```

浏览器检测到，从 ```JavaScript``` 中发起的请求需要被预检。从上面的报文中，我们看到，第 1~12 行发送了一个使用 ```OPTIONS``` 方法的“预检请求”。 ```OPTIONS``` 是 ```HTTP/1.1``` 协议中定义的方法，用以从服务器获取更多信息。该方法不会对服务器资源产生影响。 预检请求中同时携带了下面两个首部字段：
```
Access-Control-Request-Method: POST
Access-Control-Request-Headers: X-PINGOTHER
```
首部字段 ```Access-Control-Request-Method``` 告知服务器，实际请求将使用 ```POST``` 方法。首部字段 ```Access-Control-Request-Headers``` 告知服务器，实际请求将携带两个自定义请求首部字段：```X-PINGOTHER``` 与 ```Content-Type```。服务器据此决定，该实际请求是否被允许。

第14~26 行为预检请求的响应，表明服务器将接受后续的实际请求。重点看第 17~20 行：
```
Access-Control-Allow-Origin: http://foo.example
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: X-PINGOTHER, Content-Type
Access-Control-Max-Age: 86400
```
首部字段 ```Access-Control-Allow-Methods``` 表明服务器允许客户端使用 ```POST```, ```GET``` 和 ```OPTIONS``` 方法发起请求。该字段与 ```HTTP/1.1 Allow: response header``` 类似，但仅限于在需要访问控制的场景中使用。

首部字段 ```Access-Control-Allow-Headers``` 表明服务器允许请求中携带字段 ```X-PINGOTHER``` 与 ```Content-Type```。与 ```Access-Control-Allow-Methods``` 一样，```Access-Control-Allow-Headers``` 的值为逗号分割的列表。

最后，首部字段 ```Access-Control-Max-Age``` 表明该响应的有效时间为 ```86400``` 秒，也就是 24 小时。在有效时间内，浏览器无须为同一请求再次发起预检请求。请注意，浏览器自身维护了一个最大有效时间，如果该首部字段的值超过了最大有效时间，将不会生效。

# 回到最初的问题

知道上面的知识后我们知道当请求时没有遵循设置了在[CORS 安全的首部字段集合](https://fetch.spec.whatwg.org/#cors-safelisted-request-header)之外的首部字段，就会使浏览器必须首先使用 ```OPTIONS``` 方法发起一个预检请求（preflight request），从而获知服务端是否允许该跨域请求。

## 问题原因
原来我们的代码在这里设置了一个自定义首部，才会导致我们发出一个预检请求，使服务端无法正常响应。
```javascript
axios.interceptors.request.use(config => {

  config.headers['X-Token'] = 'user token'; // 让每个请求携带token--['X-Token']
  
  return config;
}, error => {

  Promise.reject(error);
})

```
原来是发出了一次 ```OPTIONS``` 预检请求。

把这行代码删掉，本以为就万事大吉今晚吃鸡了。谁知道还是会发出一次 ```OPTIONS``` 请求。

查看axios源码发现：
![image.png](http://upload-images.jianshu.io/upload_images/6073656-432525df99d663b2.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
会自动设置一个 ```'application/json;charset=utf-8'```的请求头，这不属于下面这三项之一
* application/x-www-form-urlencoded
* multipart/form-data
* text/plain

所以会产生一次 ```OPTIONS``` 预检请求，看看服务器能不能处理这个 [`Content-Type`](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Content-Type "Content-Type 实体头部用于指示资源的MIME类型 media type 。")属性。


## 解决方法
### 直接处理
解决方法有很多种，先说直接的一种：直接处理options请求。

``` javascript

router.options('*',(req, res, next) =>{
 
  res.send(200)
})
```
但是这样还是会收到如下错误：
![image.png](http://upload-images.jianshu.io/upload_images/6073656-d5958a09ce77169f.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
所以要加上：
```javascript
router.options('*',(req, res, next) =>{
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.send(200)
})
```
每有一个GET、POST请求都要这样配置这样很麻烦。
我们希望有一个一劳永逸且可维护性更好的方法。

### npm cors模块
执行如下命令安装
``` npm install --save cors ```
更多详细使用方法看文档：[cors](https://www.npmjs.com/package/cors)

在我们的项目中这样使用:
```
const cors = require('cors') 
app.use(cors({
            credentials: true, 
            origin: 'http://localhost:9001', // web前端服务器地址
            methods:['GET','POST','OPTIONS'],
}))
```
这样就可以再也不用管烦人的跨域啦~
专心开发我们的业务逻辑吧！
