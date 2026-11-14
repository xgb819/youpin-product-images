# 有品产品图生成

也支持独立生成上架七字段纯文字：名称30字、简称8字、描述30字、简述13字、三条核心卖点各24字。复用已有商品事实，尽量接近上限，不凑字添加功能，不需要生图、字体、PS或Sharp。见 [listing-copy.md](references/listing-copy.md)。

```text
$youpin-product-image-generator 用这款商品已确认资料生成上架七字段，按30/8/30/13/24/24/24字上限尽量写满，给出字数；只问真正缺失的事实，不生图。
```

AI撰写后可用纯文字辅助命令检查并落盘：

```sh
node scripts/export-listing-copy.mjs /path/to/listing.json --out /path/to/run
```

一次输出可复制TXT、字数表Markdown和依据报告JSON。程序负责约束与导出，不内置另一套LLM或固定商品卖点模板。仅此文字路径只需Node.js内置模块，完全不加载Sharp或字体。

面向小米有品商品图片制作与校对的Skill。保留上游47张详情规范，补充透明主图、实景方/横图、轮播规范、官方PSD证据，以及商品事实核验、文案来源和按编号单图修改流程。

图片默认优先复用本款原图：主图、轮播素材不足时从详情页裁切补充，去旧文案、适配比例和安全区，再排新文字。保留商品印花、结构与配件；确有需要时只扩背景或局部修补，商品重绘按实际需要及用户选择执行。来源及处理区域留档，详见 [image-workflow.md](references/image-workflow.md)。

详情页不固定套一种白底卡片模板：完整场景优先采用原图满版加字，汇总、操作、配置和参数采用信息模块。主体场景/图文模块高度不小于宽度，不能靠上下添加空白条补足高度；主打卖点、参数和配置等信息汇总模块按内容自然高度输出，可以低于宽度。超高内容按完整模块切片，不整体缩小；小卡片不从中间裁断，同一场景不重复使用。轮播适配不得截断商品、遥控器或关键配件；横向场景不能安全铺满方图时，优先向上连续扩展场景并把标题放在上方，不用纯色矩形填补剩余画布。白字默认不加投影，安全区不足不以镜像补边或空场景合成强行解决。

AI读取规则，使用现有工具制作图像。本仓库附带Sharp辅助导出程序，不含生图服务、商品识别或自动发布。普通规范查询无需API key、Node或Photoshop。

## 接入

完整使用本仓库，保留规范原图与模板：

```text
安装这个 skill：https://github.com/xgb819/youpin-product-image-generator
```

手动接入时以 `youpin-product-image-generator` 作为技能文件夹。TRAE等使用各自项目技能入口，不假定根目录会自动加载。本Fork技能名由 `mi-product-site-spec` 改为 `youpin-product-image-generator`，原详情来源保留。

```text
$youpin-product-image-generator 根据这款商品的本款资料制作透明主图、轮播和实景图；核对SKU、配置与来源，未知功能不写进文案，文字用真实MiSans排版。
```

```text
$youpin-product-image-generator 只修改03号轮播标题，复用已确认事实，保留其他图片和旧版本，检查对应官方版式及导出结果。
```

## 规则入口

| 图位/流程 | 规范 |
|---|---|
| 透明主图 | [catalog-images.md](references/catalog-images.md)，R01 |
| 实景方图/横图 | [scene-images.md](references/scene-images.md)，R02/R03 |
| 轮播首图、常规图文、活动、细节、多图、SKU | [carousel.md](references/carousel.md)，C01–C05 |
| 详情基础字阶 | [foundations.md](references/foundations.md) |
| 详情头图、卖点网格 | [hero-and-selling-points.md](references/hero-and-selling-points.md) |
| 正文、图标、多图 | [body-and-icons.md](references/body-and-icons.md)、[multi-image.md](references/multi-image.md) |
| 参数、细节、品牌、FAQ | [details-parameters-brand.md](references/details-parameters-brand.md)、[faq.md](references/faq.md) |
| 正误对照与证据差异 | [anti-patterns.md](references/anti-patterns.md)、[evidence-notes.md](references/evidence-notes.md) |
| 商品事实、文案依据 | [product-facts.md](references/product-facts.md) |
| 上架七字段纯文字 | [listing-copy.md](references/listing-copy.md)、[listing-fields.json](references/listing-fields.json) |
| 导出及单图重做 | [image-workflow.md](references/image-workflow.md)、[render-manifest.md](references/render-manifest.md) |

官方条文、PSD实测、几何推导和实施选择分别记录：轮播上方居中不套到详情头图；横图940×470不套方图640×640；详情两图480px不套轮播486/320px。不凭规范板编号认定所有商品固定7/8张轮播。

原47张详情图见 [原索引](references/source-index.md)、[sources.json](references/sources.json)；新增8张见 [补充索引](references/resource-source-index.md)、[resource-sources.json](references/resource-sources.json)；3个官方PSD及文字层证据见 [carousel-template-evidence.json](references/carousel-template-evidence.json)。示例商品与参数、认证、奖项不作为新商品事实。

## 辅助程序与验证

Node.js≥22.13（满足所固定pnpm版本要求），使用项目声明的pnpm版本：

```sh
pnpm install --frozen-lockfile
pnpm validate
pnpm test
node scripts/render-image.mjs /path/to/image.json --out /path/to/run
node scripts/verify-image.mjs /path/to/run/image-id.png --report /path/to/run/image-id.report.json
```

`validate`核对55张规范图、1份上架文案规范摘录的哈希、3个PSD实际文字层和文档链接；`test`包括图片和七字段文字的正常导出与拒绝错误用例。文字轮播需要 `--fonts /path/to/misans` 指向三种MiSans OTF，字体不随仓库分发；上架纯文字无需字体。

测试字体相关用例时设置 `YOUPIN_FONT_DIR`，未提供时会明确skip，不能说字体测试已通过。受限Windows环境如系统临时目录缺少改名权限，可用 `YOUPIN_TEST_TMP` 指向可写且可改名的目录，例如 `.local/test-tmp`；不需要修改系统权限或关闭安全设置。

渲染器实现透明主图、实景方/横图、轮播首图和单行标题+单行描述轮播。其他变体与详情仍由AI按规范制作，可使用PS或其他真实字体排版工具；不能宣称辅助脚本已经支持全部模板。

默认preview；正式导出加 `--production`，要求资产哈希、主体框审核、文案确认和针对确切预览哈希的目检记录。脚本不代填审核确认。自动检查只证明可测的像素、字节和所提供边界，不能证明自然语言宣传、实物外观或认证。

## 素材与版本

真实商品资料、私有Logo、对话、审核记录和字体不提交公共规则仓库。使用外部工作目录或已忽略的 `runs/`、`.local/`。单图修改保留稳定ID、revision和旧版，事实变化时才追踪所有受影响图位。

用户指定单图最高1680、六张轮播、品牌模块范围、同款SKU共轮廓、同母图衍生等，属于该商品项目要求，不冒写成官方通用规则。采用1680px上限时，超高详情模块按内容完整性切片，不通过整体缩小规避；小卡片先拼接复原后按自然分组拆页。

详情规范提炼来自上游 [mi-product-site-spec](https://github.com/Ricardo0426/mi-product-site-spec)。新增来源来自用户提供的官方规范包；Banner和闪屏未在本次扩展范围内。
