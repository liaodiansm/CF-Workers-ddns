# CF-Workers-ddns

域名托管在 cloudflare， workers 需要设置3个变量

CF_DOMAIN         托管的域名，如： domain.com

CF_ZONE_ID        API 区域 ID

CF_API_TOKEN      域名对应的区域DNS的API令牌


域名托管在阿里云， workers 需要设置3个变量

ALI_DOMAIN        托管的域名，如： domain.com

ALI_ACCESS_KEY    accesskey

ALI_SECRET_KEY    secretkey

simple版，需要先添加DNS记录, 例如：my.domain.com

更新ipv4解析：curl -4 -H "name:my" https://[workers url]/

更新ipv6解析：curl -6 -H "name:my" https://[workers url]/

KV版，需要先创建 KV命名空间，然后在workers里绑定KV命名空间，变量名称为：ddns

添加 KV 对， key推荐使用 uuid， value 则是子域名名称

例如： key=FE935D9D-9C35-4A8D-B864-097F0E5AC04C， value=my

更新ipv4解析：curl -4 -H "name:FE935D9D-9C35-4A8D-B864-097F0E5AC04C" https://[workers url]/

更新ipv6解析：curl -6 -H "name:FE935D9D-9C35-4A8D-B864-097F0E5AC04C" https://[workers url]/
