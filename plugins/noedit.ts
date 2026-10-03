// 取消命令结果编辑原消息：改为发送新消息
// 用法：.noedit 切换开关（只影响自己发的命令；sudo 用户消息始终改道）
import { Plugin } from "@utils/pluginBase";
import { getPrefixes } from "@utils/pluginManager";
import { Api } from "teleproto";

const g = globalThis as any;

if (!g.__tbNoEditPatch) {
  g.__tbNoEditPatch = true;
  g.__tbNoEditOn = true;

  const originEdit = Api.Message.prototype.edit;
  const viaNewMsg = new WeakMap<object, any>();

  // 单行、以命令前缀开头且不只是前缀本身，视为命令消息
  const isCommandMsg = (msg: any) => {
    const text = String(msg?.text ?? msg?.message ?? "").trim();
    if (!text || text.includes("\n")) return false;
    return getPrefixes().some((p) => text !== p && text.startsWith(p));
  };

  // 自己的命令消息按开关决定；别人（sudo 用户）的消息一律改道
  const needRedirect = (m: any) => {
    if (!m?.client) return false;
    if (m.out === false) return true;
    return g.__tbNoEditOn && isCommandMsg(m);
  };

  Api.Message.prototype.edit = async function (params: any) {
    const self: any = this;
    try {
      if (needRedirect(self)) {
        const already = viaNewMsg.get(self);
        // 后续更新写回已发出的结果消息，避免进度信息刷屏
        if (already) return await originEdit.apply(already, [params]);
        const sent = await self.client.sendMessage(self.peerId, {
          ...params,
          message: params?.text ?? params?.message,
        });
        if (sent) {
          viaNewMsg.set(self, sent);
          return sent;
        }
      }
    } catch (e) {
      console.error("[noedit] 改道失败，回退编辑：", e);
    }
    return await originEdit.apply(self, [params]);
  };
}

class NoEditPlugin extends Plugin {
  description =
    "命令结果改为发送新消息，而不是编辑原消息\n用法：.noedit 切换开关";
  cmdHandlers = {
    noedit: async (msg: Api.Message) => {
      g.__tbNoEditOn = !g.__tbNoEditOn;
      await msg.edit({
        text: `结果输出：${
          g.__tbNoEditOn ? "发送新消息（不编辑原消息）" : "编辑原消息"
        }`,
      });
    },
  };
}

export default new NoEditPlugin();
