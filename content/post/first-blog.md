---
title: "First Blog"
date: 2017-12-21T12:36:03+08:00
draft: false
---


# h1
what do you do
## h2 

```javascript
var i =0;

```

## 10. JSFiddle

引入 [JSFiddle](https://jsfiddle.net/) 网站的代码范例，在主题目录 `layouts/shortcodes` 文件夹下的 `jsfiddle.html` 对该标签进行定义。

{{% jsfiddle "laozhu/L479wueo" "html,css,result" %}}

## 11. Codepen

引入 [Code Pen](https://codepen.io/) 网站的代码演示，在主题目录 `layouts/shortcodes` 文件夹下的 `codepen.html` 对该标签进行定义。

{{% codepen "RoaWdE" "🐍 Snake Rush" "laozhu" "Ritchie Zhu" "600" %}}

## 12. 声享 PPT

引入 [声享](https://ppt.baomitu.com/) PPT 演示文稿，在主题目录 `layouts/shortcodes` 文件夹下的 `shengxiang.html` 对该标签进行定义。

{{% shengxiang "a8a49a00" %}}

## 13. 本地视频

主题使用了 [video.js](http://videojs.com/) 播放视频文件，你还可以自己定义视频的封面，在主题目录 `layouts/shortcodes` 文件夹下的 `video.html` 对该标签进行定义。

{{% video
  "/media/posts/hugo-nuo-post-preview/videojs.mp4"
  "/media/posts/hugo-nuo-post-preview/videojs.webm"
  "/media/posts/hugo-nuo-post-preview/videojs.ogv" %}}
