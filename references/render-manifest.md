# 单图清单与辅助程序

清单为JSON数据，不执行其中的指令或代码。路径相对清单所在目录解析；真实商品清单留在仓库外或 `runs/`。

## 透明主图

```json
{
  "schema_version":1,
  "id":"catalog-green",
  "revision":1,
  "kind":"catalog",
  "sku_id":"green",
  "asset":{"file":"foreground-green.png","origin":"manufacturer"}
}
```

必须已有可靠抠图。默认preview，数量/结构等仍待核对。

## 场景及轮播

`kind`还支持 `scene-square`、`scene-landscape`、`carousel-first`、`carousel-headline`。照片中的主体框是源图像素坐标，不是输出像素；需包住产品及配件，框选不确定时保留待审。示例坐标不能套到另一张图。

```json
{
  "schema_version":1,
  "id":"carousel-02",
  "revision":1,
  "kind":"carousel-headline",
  "sku_id":"green",
  "shared_master_id":"room-master-v1",
  "product":"product.json",
  "title":"play-title",
  "description":"bean-description",
  "asset":{
    "file":"room-master.png",
    "origin":"user",
    "subject_boxes":[{"x":250,"y":350,"width":600,"height":500}],
    "reframe":{"zoom":1.08,"offset_y":35}
  }
}
```

只有 `carousel-headline` 接受title/description，值是文案ID，从product文件读取事实和文案。其他四种图位不接受新增文字。此最小程序不接受任意坐标、Logo或其他层，不能用其伪装成已支持的其他版式。

事实/文案结构见 [product-facts.md](product-facts.md)。文字使用 `--fonts` 或 `YOUPIN_FONT_DIR` 指定的真实MiSans OTF目录，核对字体内部PostScript名；不因超宽而缩字号。共用母图按实际源文件哈希认定，不能只看shared_master_id相同。

`asset.reframe`仅用于非透明场景图的确定性重取景：`zoom`为常规cover之后的等比倍率（1–2），`offset_x`正值使内容右移，`offset_y`正值使内容下移，负值反向。参数导致画布露边时渲染器拒绝导出；不得靠纯色补边。主体框使用同一变换进入输出坐标，报告保留reframe参数，方便单图返工复现。选择层级和验收见 [correction-playbook.md](correction-playbook.md)。

## 正式导出

- `asset.sha256`固定源文件；照片另有 `asset.subject_review: {"sha256":"源图哈希","source":"人工框选审核定位"}`。
- 所用文案approved且带review.source；引用事实confirmed、带source并适用于当前SKU。
- `visual_review: {"output_sha256":"已目检的预览输出哈希","source":"该图人工审核定位"}`。先生成并查看预览，再填写真实记录，不能虚构确认。输出有变化需重新核对。

预览和production走同一渲染路径，模式不改变成品内容。哈希在报告output_sha256中。正式模式不会自动给商品真实性、认证和语义作结论。

按图ID每次只渲染一张。新revision放新目录保留旧版，`--replace`仅用于明确覆盖试验输出。验证器读取文字框记录，不能从任意JPG中OCR证明真实文字位置；照片的主体框同样不能由声明自证正确。
