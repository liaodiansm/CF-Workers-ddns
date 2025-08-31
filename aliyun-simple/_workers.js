function checkEmpty(str, err) {
  if (!str || str.trim().length === 0) {
    throw new Error(err);
  }
  return str.trim();
}

function percentEncoding(str) {
  return encodeURIComponent(str)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

async function signUrl(accessKey, secretKey, action, params) {

  let parameters = {
    Format: "JSON",
    Version: "2015-01-09",
    AccessKeyId: accessKey,
    SignatureMethod: "HMAC-SHA1",
    Timestamp: new Date().toISOString(),
    SignatureVersion: "1.0",
    SignatureNonce: Math.random().toString(36).substring(2),
    Action: action,
  };

  parameters = { ...parameters, ...params };
  const sortedKeys = Object.keys(parameters).sort();

  let canonicalQuery = "";
  sortedKeys.forEach((key) => { canonicalQuery += "&" + percentEncoding(key) + "=" + percentEncoding(parameters[key]); });

  const data = new TextEncoder().encode("GET&%2F&" + percentEncoding(canonicalQuery.slice(1)));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey + "&"),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    data
  );

  const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return "https://alidns.aliyuncs.com/?" + canonicalQuery + "&Signature=" + percentEncoding(base64);
}

export default {
  async fetch(request, env) {

    try {

      const domain = checkEmpty(env.ALI_DOMAIN, "未配置 ALI_DOMAIN");
      const accessKey = checkEmpty(env.ALI_ACCESS_KEY, "未配置 ALI_ACCESS_KEY");
      const secretKey = checkEmpty(env.ALI_SECRET_KEY, "未配置 ALI_SECRET_KEY");

      const addr = request.headers.get("CF-Connecting-IP");
      const name = checkEmpty(request.headers.get("name"), "缺少子域名");

      const domainRgx = /^(?=.{1,253}$)(?!-)([a-zA-Z0-9-]{1,63}(?<!-)\.)+[a-zA-Z]{2,63}$/;

      const subdomain = name + "." + domain;
      if (!domainRgx.test(subdomain)) {
        throw new Error("域名不合规");
      }

      let type = "";
      const ip4Rgx = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
      const ip6Rgx = /^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(([0-9A-Fa-f]{1,4}:){1,7}:)|(([0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,5}(:[0-9A-Fa-f]{1,4}){1,2})|(([0-9A-Fa-f]{1,4}:){1,4}(:[0-9A-Fa-f]{1,4}){1,3})|(([0-9A-Fa-f]{1,4}:){1,3}(:[0-9A-Fa-f]{1,4}){1,4})|(([0-9A-Fa-f]{1,4}:){1,2}(:[0-9A-Fa-f]{1,4}){1,5})|([0-9A-Fa-f]{1,4}:)((:[0-9A-Fa-f]{1,4}){1,6})|(:((:[0-9A-Fa-f]{1,4}){1,7}|:)))(%.+)?$/;

      if (ip4Rgx.test(addr)) {
        type = "A";
      } else if (ip6Rgx.test(addr) && addr.includes(":")) {
        type = "AAAA";
      } else {
        throw new Error("未知ip");
      }

      //使用 https://dns.alidns.com/resolve，解析记录更新延迟严重
      let resp = await fetch(`https://1.1.1.1/dns-query?name=${subdomain}&type=${type}`, {
        headers: { "Accept": "application/dns-json" }
      });

      let data = await resp.json();
      if (data.Answer != null) {
        const ips = data.Answer.filter(a => a.type === 1 || a.type === 28).map(a => a.data);
        for (const _ip of ips) {
          if (_ip == addr) {
            return new Response(addr);
          }
        }
      }

      // 搜索子域名记录
      const queryUrl = await signUrl(accessKey, secretKey, "DescribeDomainRecords", {
        DomainName: domain,
        RRKeyWord: name,
        Type: type,
        OrderBy: "RR",
        Direction: "ASC"
      });

      resp = await fetch(queryUrl);
      data = await resp.json();

      if(data.TotalCount === 0){
        throw new Error("请先添加子域名");
      }

      const record = data.DomainRecords.Record[0];
      if(record.RR != name){
        throw new Error("请先添加子域名");
      }
      if(record.Value == addr){
        return new Response(addr);
      }

      const actionUrl = await signUrl(accessKey, secretKey, "UpdateDomainRecord", {
        RecordId: record.RecordId,
        RR: name,
        Type: type,
        Value: addr,
      });

      resp = await fetch(actionUrl);
      data = await resp.json();

      if(data.Code == null){
        return new Response(addr);
      }

      throw new Error("更新解析出错:" + data.Message);
    } catch (err) {
      let e = err;
      return new Response(e.toString(), { status: 500 });
    }

  },
};
