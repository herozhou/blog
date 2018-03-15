---
title: "First Blog"
date: 2017-12-21T12:36:03+08:00
draft: true
---


# h1
what do you do
## h2 

```javascript
var i =0;

```

## 7. 图片 {#section-07}

不带标题的图片，如下图👇

```
/media/posts/hugo-nuo-post-preview/01.jpg
```
![这是一只梅花鹿](/media/posts/hugo-nuo-post-preview/01.jpg)

带标题的图片，如下图👇

{{% figure src="/media/posts/hugo-nuo-post-preview/01.jpg" alt="这是一只梅花鹿" title="显然，这是一只梅花鹿" %}}




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
