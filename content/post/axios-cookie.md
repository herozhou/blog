---
title: "浏览器无法自动设置cookie"
date: 2017-10-19T01:37:56+08:00
lastmod: 2017-10-1901:37:56+08:00
draft: false
tags: ["Vue.js","CORS"]
categories: ["CORS"]
author: "herozhou工巧"
---

在跨域请求场景下，vue 项目中使用 ```axios``` 发送请求，能接受到服务器传来的set-cookie，但是无法保存在本地。

 <!--more-->

# 问题描述
在跨域请求场景下，vue 项目中使用 ```axios``` 发送请求，能接受到服务器传来的set-cookie，但是无法保存在本地。
如下图所示：

![image.png](http://upload-images.jianshu.io/upload_images/6073656-c930ff3aad86cbc5.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

# 划重点时间

**`Access-Control-Allow-Credentials`** 响应头表示是否可以将对请求的响应暴露给页面。返回true则可以，其他值均不可以。

Credentials可以是 cookies, authorization headers 或 TLS client certificates.

当作为对预检请求的响应的一部分时，这能表示是否真正的请求可以使用credentials。注意简单的[`GET`](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Methods/GET "HTTP GET 方法请求指定的资源。使用 GET 的请求应该只用于获取数据。")请求没有预检，所以若一个对资源的请求带了credentials，如果这个返回这个资源，响应就会被浏览器忽视，不会返回到web内容。

``` `Access-Control-Allow-Credentials` ：true```

与``` XMLHttpRequest.withCredentials ``` 或Fetch API中的[`Request()`](https://developer.mozilla.org/zh-CN/docs/Web/API/Request/Request "Request() 构造器创建一个新的Request 对象。")构造器中的`credentials` 选项结合使用。

Credentials必须在前后端都被配置（即the `Access-Control-Allow-Credentials` header 和 XHR 或Fetch request中都要配置）才能使带credentials的CORS请求成功。

# 分析原因
前后端没有达成共识，前端没有说要去读取cookie中的内容，后端没有说你可以读取我的响应内容。所以就没办法读取set-cookie请求头。

# 解决办法

## 前端
```
axios('http://httpbin.org/headers', {
  method: 'GET',
  data: some.data,
  withCredentials: true
})

axios.defaults.withCredentials = true;
```
更推荐创建axios对象的方法，更方便。
```
const myApi = axios.create({
  baseURL: 'http://someUrl/someEndpoint',
  timeout: 10000,
  withCredentials: true,
});'
```
## 后端
推荐上篇介绍的cors：
```
const cors = require('cors')
app.use(cors({
            origin: 'http://localhost:9001', // web前端服务器地址
            methods:['GET','POST','OPTIONS'],
            credentials:true,
}))
```
或者直接设置响应头：
```
 response.header("Access-Control-Allow-Credentials", "true");
```

# 与CROS有关的响应及请求首部字段

## HTTP 响应首部字段

本节列出了规范所定义的响应首部字段。上一小节中，我们已经看到了这些首部字段在实际场景中是如何工作的。

### Access-Control-Allow-Origin

响应首部中可以携带一个 [`Access-Control-Allow-Origin`](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Access-Control-Allow-Origin "Editorial review completed.") `字段，其语法如下:`

```
Access-Control-Allow-Origin: <origin> | *
```

其中，origin 参数的值指定了允许访问该资源的外域 URI。对于不需要携带身份凭证的请求，服务器可以指定该字段的值为通配符，表示允许来自所有域的请求。

例如，下面的字段值将允许来自 http://mozilla.com 的请求：

```
Access-Control-Allow-Origin: http://mozilla.com
```

如果服务端指定了具体的域名而非“*”，那么响应首部中的 Vary 字段的值必须包含 Origin。这将告诉客户端：服务器对不同的源站返回不同的内容。

### Access-Control-Expose-Headers

译者注：在跨域访问时，XMLHttpRequest对象的getResponseHeader()方法只能拿到一些最基本的响应头，Cache-Control、Content-Language、Content-Type、Expires、Last-Modified、Pragma，如果要访问其他头，则需要服务器设置本响应头。

[`Access-Control-Expose-Headers`](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Access-Control-Expose-Headers "响应首部 Access-Control-Expose-Headers 列出了哪些首部可以作为响应的一部分暴露给外部。")

头让服务器把允许浏览器访问的头放入白名单，例如：

```
Access-Control-Expose-Headers: X-My-Custom-Header, X-Another-Custom-Header
```

这样浏览器就能够通过getResponseHeader访问`X-My-Custom-Header`和 `X-Another-Custom-Header` 响应头了`。`

### Access-Control-Max-Age

[`Access-Control-Max-Age`](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Access-Control-Max-Age "The Access-Control-Max-Age 这个响应首部表示 preflight request  （预检请求）的返回结果（即 Access-Control-Allow-Methods 和Access-Control-Allow-Headers 提供的信息） 可以被缓存多久。")

头指定了preflight请求的结果能够被缓存多久，请参考本文在前面提到的preflight例子。

```
Access-Control-Max-Age: <delta-seconds>
```

`delta-seconds` 参数表示preflight请求的结果在多少秒内有效。

### Access-Control-Allow-Credentials

[`Access-Control-Allow-Credentials`](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Access-Control-Allow-Credentials "Access-Control-Allow-Credentials 响应头表示是否可以将对请求的响应暴露给页面。返回true则可以，其他值均不可以。")

头指定了当浏览器的`credentials`设置为true时是否允许浏览器读取response的内容。当用在对preflight预检测请求的响应中时，它指定了实际的请求是否可以使用`credentials`。请注意：简单 GET 请求不会被预检；如果对此类请求的响应中不包含该字段，这个响应将被忽略掉，并且浏览器也不会将相应内容返回给网页。

```
Access-Control-Allow-Credentials: true
```

上文已经讨论了[附带身份凭证的请求](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Access_control_CORS#Requests_with_credentials)。

### Access-Control-Allow-Methods

[`Access-Control-Allow-Methods`](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Access-Control-Allow-Methods "响应首部 Access-Control-Allow-Methods 在对 preflight request.（预检请求）的应答中明确了客户端所要访问的资源允许使用的方法或方法列表。") 首部字段用于预检请求的响应。其指明了实际请求所允许使用的 HTTP 方法。

```
Access-Control-Allow-Methods: <method>[, <method>]*
```

相关示例见[这里](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Access_control_CORS$edit#Preflighted_requests)。

### Access-Control-Allow-Headers

[`Access-Control-Allow-Headers`](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Access-Control-Allow-Headers "响应首部 Access-Control-Allow-Headers 用于 preflight request （预检请求）中，列出了将会在正式请求的 Access-Control-Expose-Headers 字段中出现的首部信息。") 首部字段用于预检请求的响应。其指明了实际请求中允许携带的首部字段。

```
Access-Control-Allow-Headers: <field-name>[, <field-name>]*
```
## HTTP 请求首部字段

本节列出了可用于发起跨域请求的首部字段。请注意，这些首部字段无须手动设置。 当开发者使用 XMLHttpRequest 对象发起跨域请求时，它们已经被设置就绪。

### Origin

[`Origin`](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Origin "请求首部字段 Origin 指示了请求来自于哪个站点。该字段仅指示服务器名称，并不包含任何路径信息。该首部用于 CORS 请求或者 POST 请求。除了不包含路径信息，该字段与 Referer 首部字段相似。") 首部字段表明预检请求或实际请求的源站。

```
Origin: <origin>
```

origin 参数的值为源站 URI。它不包含任何路径信息，只是服务器名称。

**Note:** 有时候将该字段的值设置为空字符串是有用的，例如，当源站是一个 data URL 时。

注意，不管是否为跨域请求，ORIGIN 字段总是被发送。

### Access-Control-Request-Method

[`Access-Control-Request-Method`](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Access-Control-Request-Method "The compatibility table in this page is generated from structured data. If you'd like to contribute to the data, please check out https://github.com/mdn/browser-compat-data and send us a pull request.") 首部字段用于预检请求。其作用是，将实际请求所使用的 HTTP 方法告诉服务器。

```
Access-Control-Request-Method: <method>
```

相关示例见[这里](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Access_control_CORS#Preflighted_requests)。

### Access-Control-Request-Headers

[`Access-Control-Request-Headers`](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Access-Control-Request-Headers "请求首部  Access-Control-Request-Headers 出现于 preflight request （预检请求）中，用于通知服务器在真正的请求中会采用哪些请求首部。") 首部字段用于预检请求。其作用是，将实际请求所携带的首部字段告诉服务器。

```
Access-Control-Request-Headers: <field-name>[, <field-name>]*
```

相关示例见[这里](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Access_control_CORS#)。


# 后记
这里在设置这些之后我发现还是没有用，依然无法保存cookie。
使用firefox开发者工具查看一下请求果然发现了问题。

在vue初始化之前请求是可以存储的：
![image.png](http://upload-images.jianshu.io/upload_images/6073656-901ef9bd86a9b947.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

在vue初始化之后请求存储失败：
![image.png](http://upload-images.jianshu.io/upload_images/6073656-2be1cbd6de90f9f7.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

这是为什么呢？

这时我看到了救星：堆栈追踪

请求一：
![image.png](http://upload-images.jianshu.io/upload_images/6073656-6530f8dfd264e942.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

请求二：
![image.png](http://upload-images.jianshu.io/upload_images/6073656-d93ae051fd27cb8b.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

可以看到在发送ajax请求之前，vue app.js做了一些事情，使cookie无法在请求头中携带cookie。

定位到文件中果然发现了问题，原来是Mock拦截了请求，做了一些处理。

![image.png](http://upload-images.jianshu.io/upload_images/6073656-248409b336f584ca.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

把Mock禁用掉就好了。

Firefox开发者工具果然名不虚传，解决了困扰我一天的问题。虽然这个问题仔细想一想项目结构就会发现，但是人们总是会当成X-Y问题处理。


