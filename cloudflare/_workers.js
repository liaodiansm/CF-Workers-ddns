function checkEmpty(str, err) {
  if (!str || str.trim().length === 0) {
    throw new Error(err);
  }
  return str.trim();
}


export default {

  async fetch(request, env, ctx) {

    try {

      const domain = checkEmpty(env.CF_DOMAIN, "未配置 CF_DOMAIN");
      const zoneid = checkEmpty(env.CF_ZONE_ID, "未配置 CF_ZONE_ID");
      const token = checkEmpty(env.CF_API_TOKEN, "未配置 CF_API_TOKEN");

      const key = checkEmpty(request.headers.get("name"), "缺少子域名");
      const addr = request.headers.get("CF-Connecting-IP");

      const name = await env.ddns.get(key);
      if (name == null || name.length == 0) {
        throw new Error("未配置的域名");
      }

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

      const res = await fetch(`https://1.1.1.1/dns-query?name=${subdomain}&type=${type}`, {
        headers: { "Accept": "application/dns-json" }
      });

      let data = await res.json();
      if (data.Answer != null) {
        const ips = data.Answer.filter(a => a.type === 1 || a.type === 28).map(a => a.data);
        for (const _ip of ips) {
          if (_ip == addr) {
            return new Response(addr);
          }
        }
      }

      const url = `https://api.cloudflare.com/client/v4/zones/${zoneid}/dns_records`;

      const getResp = await fetch(url + `?type=${type}&name=${subdomain}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      })

      data = await getResp.json();
      if (!data.success) {
        throw new Error("获取子域名失败");
      }

      if (data.result.length === 0) {

        const addResp = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.CF_API_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            type: type,
            name: subdomain,
            content: addr,
            ttl: 1,
            proxied: false
          })
        });
  
        data = await addResp.json();
        if (data.success) {
          return new Response(data.result.content);
        }

      }

      const record = data.result[0];

      const setResp = await fetch(url + `/${record.id}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: type,
          name: subdomain,
          content: addr,
          ttl: 1,
          proxied: record.proxied
        })
      })

      data = await setResp.json();
      if (data.success) {
        return new Response(data.result.content);
      }

      throw new Error("更新解析出错");

    } catch (err) {
      let e = err;
      return new Response(e.toString(), { status: 500 });
    }
  }
};
