## Production
### deploy
Commit changes.
The build is initiated by updating the version. This updates the version, tags and pushes to master, and pushes to release branch.
```sh
$ npm version patch|minor|major
```
The build will need to be approved in CodePipeline for it to be deployed to the production stage.

#cd ~ && ln -s google-ads-7864081494.yaml google-ads.yaml
#MCC 7864081494
export GOOGLE_ADS_REFRESH_TOKEN=1/PJnkY44BT-NZN6eCJFTbebDG1eCWMpeDhREkJ6W6C9I
export GOOGLE_ADS_CLIENT_ID=1031328113312-7881pntatrqo07idt3nk09euooo232t1.apps.googleusercontent.com
export GOOGLE_ADS_CLIENT_SECRET=5UtS9UWDA2vqzMfujOhiprOG
export GOOGLE_ADS_DEVELOPER_TOKEN=jh6jxvQqjtPGMfpd8Z1DgA
export GOOGLE_ADS_LOGIN_CUSTOMER_ID=7864081494

#cd ~ && ln -s google-ads-8411749266.yaml google-ads.yaml
#MCC 8411749266
export GOOGLE_ADS_REFRESH_TOKEN=1//0dwbX9k8MbkU3CgYIARAAGA0SNwF-L9Ir3BK6iPVFmz1LnknesHfUcbZU_ZfkVshM5cJIuW5K4jdkSOsqZPtSuSW86Ri_u9PfeDU
export GOOGLE_ADS_CLIENT_ID=212486909270-4u866a4e9iv31gev2bs279b7m3pte2o7.apps.googleusercontent.com
export GOOGLE_ADS_CLIENT_SECRET=MmOPvNdeLMyNhCbf5CQynhl1
export GOOGLE_ADS_DEVELOPER_TOKEN=i6lWzb4MnrNdJxEcnbrTxA
export GOOGLE_ADS_LOGIN_CUSTOMER_ID=8411749266

#allhotels.json
psql -hprimary-postgresql-14-3.cluster-chqq3p2jw62x.us-east-1.rds.amazonaws.com  -p5432 -dcore -Uroot --no-align --tuples-only -c "select distinct h.id, h.hp_id, replace(h.name, '|', '####'), h.star_rating, replace(h.street1, '|', '####'), c.id, c.name, sp.name, sp.abbreviation, co.name, co.abbreviation, hc.name, hcg.name from hotel h inner join city c on c.id = h.city_id inner join state_province sp on sp.id = c.state_province_id inner join country co on co.id = c.country_id inner join hotel_chain hc on hc.id = h.hotel_chain_id left join hotel_chain_group hcg on hc.hotel_chain_group_id = hcg.id" > allhotels.json
:%s/"/'/g
:%s/^\([^|]*\)|\([^|]*\)|\([^|]*\)|\([^|]*\)|\([^|]*\)|\([^|]*\)/{"id": \1, "hp_id": \2, "name": "\3", "star_rating": "\4", "street1": "\5", "city_id": "\6"/
:%s/|\([^|]*\)|\([^|]*\)|\([^|]*\)|\([^|]*\)|\([^|]*\)|\([^|]*\)|\([^|]*\)/, "city_name": "\1", "state_name": "\2", "state_abbreviation": "\3", "country_name": "\4", "country_abbreviation": "\5", "chain_name": "\6", "chain_group_name": "\7"},/
:%s/####/|/g
:%s/"NULL"/""/g
:%s/\\/\//g

#get complete cities
select distinct c.id, c.name, sp.name, sp.abbreviation, co.name, co.abbreviation, cb.name, tz.description from hotel h inner join city c on c.id = h.city_id inner join state_province sp on sp.id = c.state_province_id inner join country co on co.id = c.country_id left join cbsa cb on cb.id = c.cbsa_id left join time_zone tz on tz.id = coalesce(c.time_zone_id, sp.time_zone_id) where co.abbreviation in ('US', 'CA')

#get hotelcities.csv
select distinct h.id, replace(h.name, '|', '####'), c.id, c.name, sp.name, sp.abbreviation, co.name, co.abbreviation, h.hp_id, hc.id, hc.name, hc.code, replace(h.street1, '|', '####') from hotel h inner join city c on c.id = h.city_id inner join state_province sp on sp.id = c.state_province_id inner join country co on co.id = c.country_id inner join hotel_chain hc on hc.id = h.hotel_chain_id

#hotels for ads hotelplanner.com
select distinct h.id, h.name, c.id, c.name from hotel h inner join city c on h.city_id = c.id and c.country_id in (33,217) inner join hotel_media hm on h.id = hm.hotel_id and hm.url not like '%hotelplanner.com%' inner join supplier_hotel sh on h.id = sh.hotel_id and sh.supplier_id in (3, 6, 12) where h.hotel_status_id = 1 and h.hotel_chain_id = 594 and (h.low_rate <> 100 or h.high_rate not in (100,500)) and property_type_id < 9 order by h.id;

#hotelareatier
select h.id, tr.hp_id, ac.area_id, case when avg(rate) < 100 then 1 else case when avg(rate) >= 170 then 3 else 2 end end from temp_r77_rates tr inner join hotel h on h.hp_id = tr.hp_id inner join area_city ac on ac.city_id = h.city_id where h.property_type_id in (1,2) group by tr.hp_id, h.id, ac.area_id;
:%s/\(.*\)|\(.*\)|\(.*\)|\(.*\)/{"id":\1, "hpId": \2, "areaId": \3, "groupId": \4}/g

#areas
#hr & hp
'TX', 'LA', 'MS', 'AL', 'OK'
'AR', 'IA', 'IL', 'KS', 'MN', 'MO', 'ND', 'NE', 'SD', 'TN', 'WI'
'ME', 'VT', 'NH', 'MA', 'NY', 'CT', 'RI', 'PA', 'NJ', 'DE', 'MD', 'DC'
'OH', 'WV', 'MI', 'IN', 'VA', 'KY', 'NC'
'FL', 'GA', 'SC'
tzid = 2
tzid > 3
psql -hprimary-postgresql-14-3.cluster-chqq3p2jw62x.us-east-1.rds.amazonaws.com  -p5432 -dcore -Uroot --no-align --tuples-only -c "select distinct a.id, c.name, sp.abbreviation from area a inner join city c on a.city_id = c.id inner join state_province sp on sp.id = c.state_province_id where a.hr_account_group = 1" > hrareas1.json
psql -hprimary-postgresql-14-3.cluster-chqq3p2jw62x.us-east-1.rds.amazonaws.com  -p5432 -dcore -Uroot --no-align --tuples-only -c "select distinct a.id, c.name, sp.abbreviation from area a inner join city c on a.city_id = c.id inner join state_province sp on sp.id = c.state_province_id where a.hr_account_group = 2" > hrareas2.json
psql -hprimary-postgresql-14-3.cluster-chqq3p2jw62x.us-east-1.rds.amazonaws.com  -p5432 -dcore -Uroot --no-align --tuples-only -c "select distinct a.id, c.name, sp.abbreviation from area a inner join city c on a.city_id = c.id inner join state_province sp on sp.id = c.state_province_id where a.hr_account_group = 3" > hrareas3.json
psql -hprimary-postgresql-14-3.cluster-chqq3p2jw62x.us-east-1.rds.amazonaws.com  -p5432 -dcore -Uroot --no-align --tuples-only -c "select distinct a.id, c.name, sp.abbreviation from area a inner join city c on a.city_id = c.id inner join state_province sp on sp.id = c.state_province_id where a.hr_account_group = 4" > hrareas4.json
psql -hprimary-postgresql-14-3.cluster-chqq3p2jw62x.us-east-1.rds.amazonaws.com  -p5432 -dcore -Uroot --no-align --tuples-only -c "select distinct a.id, c.name, sp.abbreviation from area a inner join city c on a.city_id = c.id inner join state_province sp on sp.id = c.state_province_id where a.hr_account_group = 5" > hrareas5.json
psql -hprimary-postgresql-14-3.cluster-chqq3p2jw62x.us-east-1.rds.amazonaws.com  -p5432 -dcore -Uroot --no-align --tuples-only -c "select distinct a.id, c.name, sp.abbreviation from area a inner join city c on a.city_id = c.id inner join state_province sp on sp.id = c.state_province_id where a.hr_account_group = 6" > hrareas6.json
psql -hprimary-postgresql-14-3.cluster-chqq3p2jw62x.us-east-1.rds.amazonaws.com  -p5432 -dcore -Uroot --no-align --tuples-only -c "select distinct a.id, c.name, sp.abbreviation from area a inner join city c on a.city_id = c.id inner join state_province sp on sp.id = c.state_province_id where a.hr_account_group = 7" > hrareas7.json
#r7
select distinct a.id, c.name, sp.abbreviation from area a inner join city c on a.city_id = c.id inner join state_province sp on sp.id = c.state_province_id where sp.time_zone_id = 1 > r7areas1.json
select distinct a.id, c.name, sp.abbreviation from area a inner join city c on a.city_id = c.id inner join state_province sp on sp.id = c.state_province_id where sp.time_zone_id = 3 > r7areas2.json
select distinct a.id, c.name, sp.abbreviation from area a inner join city c on a.city_id = c.id inner join state_province sp on sp.id = c.state_province_id where sp.time_zone_id not in (1,3) > r7areas3.json
:%s/\(.*\)|\(.*\)|\(.*\)/{"id": \1, "city": "\2", "state": "\3"},/

#chainarea
select ac.area_id, h.city_id, hc.code, count(1) from hotel h inner join hotel_chain hc on h.hotel_chain_id = hc.id inner join area_city ac on ac.city_id = h.city_id where hotel_status_id = 1 and hc.code in ('CI', 'HH', 'YO', 'CX', 'CZ', 'GI', 'HG', 'YZ', 'TL', 'FN', 'RF', 'BH', 'RC', 'XV', 'RL', 'LQ', 'BU', 'HI', 'QI', 'RD', 'SZ', 'WG', 'DI', 'EO', 'EX', 'HJ', 'DR', 'HX', 'KG', 'ES', 'BW', 'CC', 'SE', 'MI', 'HZ', 'MX', 'MZ', 'RA', 'RI') group by ac.area_id, h.city_id, hc.code;
:%s/\(.*\)|\(.*\)|\(.*\)|\(.*\)/{"areaId": \1, "cityId": \2, "chainCode": "\3", "count": \4}/

#cityarea
select distinct ac.area_id, h.city_id from hotel h inner join area_city ac on ac.city_id = h.city_id;
:%s/\(.*\)|\(.*\)/{"areaId": \1, "cityId": \2}/

#manual inserts
--ad groups
grep advertisingChannelType files/dicampaigns.out > files/dicampaignsshallow.json
sed -i 's/[^}]\+$//' files/dicampaignsshallow.json
python3 src/manual_gen_ad_group.py di
comment out body of prepare method in src/ad_group_lambda.py
set google_ad_group write capacity to 150 
set current_lambda = ad_group_lambda in src/manual.py
nohup python3 src/manual.py files/diadgroups.json > files/diadgroups.out &
set google_ad_group write capacity to 1
uncomment out body of prepare method in src/ad_group_lambda.py

--keywords
grep cpcBid files/ciadgroups.out | sed 's/[^}]\+$//' > files/ciadgroups.json
generate csv file
select ga.id
, gag.id
, gk2.text
, gk2.match_type
, gk2.bid
, gk2.status
from paid.google_account ga
inner join stage.google_campaign gc
on gc.account_id = ga.id
inner join stage.google_ad_group gag
on gc.id = gag.campaign_id
inner join paid.google_campaign gc2
on gc.object_id = gc2.object_id
inner join paid.google_ad_group gag2
on gc2.id = gag2.campaign_id
inner join paid.google_keyword gk2
on gag2.id = gk2.ad_group_id
and gk2.status <> 'Deleted'
where ga.name like 'Days Inn - Radius -%'
and gag2.name = concat('Days Inn - ', gag.name)
and gc2.name like '% - Radius'
order by gag.id
, gk2.match_type
, gk2.text
python3 src/manual_gen_keyword.py di
comment out body of prepare method in src/ad_group_keyword_lambda.py
set google_keyword write capacity to 300 
set current_lambda = ad_group_keyword_lambda in src/manual.py
nohup python3 src/manual.py files/dikeywords.json > files/dikeywords.out &
set google_keyword write capacity to 1
uncomment out body of prepare method in src/ad_group_keyword_lambda.py

--negative
BE CAREFUL with object id if not city change query
select ga.id
, gag.id
, gc.name
, split_part(ga.name, ' - ', 3)
, sp.name
, sp.abbreviation
from paid.google_account ga
inner join stage.google_campaign gc
on gc.account_id = ga.id
inner join stage.google_ad_group gag 
on gc.id = gag.campaign_id
inner join core.city c
on gc.object_id = c.id
inner join core.state_province sp
on c.state_province_id = sp.id
where ga.name like 'Days Inn - Radius -%' 
order by ga.id
, gc.name
python3 src/manual_gen_negative_keyword.py di
set google_keyword write capacity to 300 
set current_lambda = ad_group_keyword_lambda in src/manual.py
nohup python3 src/manual.py files/dinegatives.json > files/dinegatives.out &
set google_keyword write capacity to 1
uncomment out body of prepare method in src/ad_group_keyword_lambda.py

--ad cities file
select replace(ga.id, '-', '')
, gc.id
, split_part(ga.name, ' - ', 3)
, gag.id
, gcs.destination_city_name
, gcs.destination_state_province_name
, sp.abbreviation
, co.abbreviation
from google_account ga
inner join google_campaign gc
on ga.id = gc.account_id
inner join google_campaign_segment gcs
on gc.id = gcs.campaign_id
inner join google_ad_group gag
on gc.id = gag.campaign_id
inner join core.state_province sp
on sp.name = gcs.destination_state_province_name
inner join core.country co
on co.name = gcs.destination_country_name
where ga.name like 'City -%Radius%'

--ads
select ga.id
, gag.id
, gk2.title1
, gk2.title2
, gk2.title3
, gk2.description1
, gk2.description2
, gk2.path1
, gk2.path2
, gk2.destination_url
, gk2.status
from paid.google_account ga
inner join stage.google_campaign gc
on gc.account_id = ga.id
inner join stage.google_ad_group gag 
on gc.id = gag.campaign_id
inner join paid.google_campaign gc2 
on gc.object_id = gc2.object_id
inner join paid.google_ad_group gag2
on gc2.id = gag2.campaign_id
inner join paid.google_ad gk2 
on gag2.id = gk2.ad_group_id
and gk2.status <> 'Deleted'
and gk2.ad_type = 'Expanded Text Ad'
where ga.name like 'Days Inn - Radius -%' 
and gag2.name = concat('Days Inn - ', gag.name)
and gc2.name like '% - Radius'
order by ga.id
, gag.id
set the correct url function in src/manual_gen*
set correct chain or amenity in src/manual_gen* 
python3 src/manual_gen_old_ads.py di or python3 src/manual_gen_ads.py di
comment out body of prepare method in src/ad_lambda.py
set google_ad write capacity to 200 
set current_lambda = ad_lambda in src/manual.py
nohup python3 src/manual.py files/diads.json > files/diads.out &
set google_ad write capacity to 1
uncomment out body of prepare method in src/ad_lambda.py

--feed items
edit files and phone numbers in src/manual_gen_feed_item.py
grep '"mapping"' files/bwcallfeeds.out > files/bwcallfeeds.json 
python3 src/manual_gen_feed_item.py bw
edit src/manual.py set current_lambda feed_item_lambda
nohup python3 src/manual.py files/bwcallfeeditems.json >> files/bwcallfeeditems.out &
grep 'attributes' files/bwcallfeeditems.out > files/bwcallfeeditems.json

--campaign feeds
python3 src/manual_gen_campaign_feed.py di > files/dicampaignfeeds.json
edit src/manual.py set current_lambda campaign_feed_lambda
nohup python3 src/manual.py files/dicampaignfeeds.json > files/dicampaignfeeds.out &



#copy stage to paid
--accounts do first and import before doing campaigns, ad groups, etc
select concat(substring(cast(gal.id as varchar), 1, 3), '-', substring(cast(gal.id as varchar), 4, 3), '-', substring(cast(gal.id as varchar), 7)) id
, concat(substring(cast(gal.parent_account_id as varchar), 1, 3), '-', substring(cast(gal.parent_account_id as varchar), 4, 3), '-', substring(cast(gal.parent_account_id as varchar), 7)) parent_account_id
    , max(gal.name) name
    , if(min(gal.status) = 'enabled', 'Active', 'Inactive') status
    , 1 campaign_level_bidding
from stage.google_account_log gal
inner join (select id
    , max(partition_date) partition_date
from stage.google_account_log
group by id) t1
on gal.id = t1.id
and gal.partition_date = t1.partition_date
group by gal.id
    , parent_account_id

--campaigns
select gc.id
, ga.id account_id
, gc.name
, if(gc.status = 'enabled', 'Active', if(gc.status = 'deleted', 'Deleted', 'Paused')) status
, gc.landing_page_id
, gc.object_id
from paid.google_account ga
inner join stage.google_campaign gc
on cast(replace(ga.id, '-', '') as bigint) = gc.account_id
where (ga.name like '%Smart Bidding%' or ga.name like 'Room77%')

--campaign segments
select gcs.campaign_id
, gcs.segments.traffic_source_type
, gcs.segments.traffic_type
, gcs.segments.landing_page
, gcs.segments.amenity
, gcs.segments.hotel_chain_name
, gcs.segments.location_targeting_type
, gcs.segments.poi_type
, gcs.segments.spatial_type
, gcs.segments.device_type
, gcs.segments.poi_sub_type
, gcs.segments.age_range
, gcs.segments.gender
, gcs.segments.keyword_pattern
, gcs.segments.destination_poi_name
, gcs.segments.destination_spatial_name
, gcs.segments.destination_city_name
, gcs.segments.destination_state_province_name
, gcs.segments.destination_country_name
, gcs.segments.destination_cbsa
, gcs.segments.destination_timezone
, gcs.segments.destination_city_id
, gcs.segments.destination_poi_id
, gcs.segments.destination_spatial_id
, gcs.segments.destination_hotel_id
, gcs.segments.site
, gcs.segments.locale
, gcs.segments.language
, gcs.segments.destination_area_id
, gcs.segments.destination_area_group_id
from paid.google_account ga
inner join stage.google_campaign gc
on cast(replace(ga.id, '-', '') as bigint) = gc.account_id
inner join stage.google_campaign_segment gcs
on gc.id = gcs.campaign_id
where (ga.name like '%Smart Bidding%' or ga.name like 'Room77%')

--ad groups
select gag.id
, gag.campaign_id
, gag.name
, if(gag.status = 'enabled', 'Active', if(gag.status = 'deleted', 'Deleted', 'Paused')) status
, gag.landing_page_id
, gag.object_id
from paid.google_account ga
inner join stage.google_campaign gc
on cast(replace(ga.id, '-', '') as bigint) = gc.account_id
inner join stage.google_ad_group gag
on gc.id = gag.campaign_id
where (ga.name like '%Smart Bidding%' or ga.name like 'Room77%')

--ad group segments
select gags.ad_group_id
, gags.segments.traffic_source_type
, gags.segments.traffic_type
, gags.segments.landing_page
, gags.segments.amenity
, gags.segments.hotel_chain_name
, gags.segments.location_targeting_type
, gags.segments.poi_type
, gags.segments.spatial_type
, gags.segments.device_type
, gags.segments.poi_sub_type
, gags.segments.age_range
, gags.segments.gender
, gags.segments.keyword_pattern
, gags.segments.destination_poi_name
, gags.segments.destination_spatial_name
, gags.segments.destination_city_name
, gags.segments.destination_state_province_name
, gags.segments.destination_country_name
, gags.segments.destination_cbsa
, gags.segments.destination_timezone
, gags.segments.destination_city_id
, gags.segments.destination_poi_id
, gags.segments.destination_spatial_id
, gags.segments.destination_hotel_id
, gags.segments.site
, gags.segments.locale
, gags.segments.language
, gags.segments.destination_area_id
, gags.segments.destination_area_group_id
from paid.google_account ga
inner join stage.google_campaign gc
on cast(replace(ga.id, '-', '') as bigint) = gc.account_id
inner join stage.google_ad_group gag
on gc.id = gag.campaign_id
inner join stage.google_ad_group_segment gags
on gag.id = gags.ad_group_id
where (ga.name like '%Smart Bidding%' or ga.name like 'Room77%')

--ads 
select gad.id
, gad.ad_group_id
, if(gad.status = 'enabled', 'Active', if(gad.status = 'deleted', 'Deleted', 'Paused')) status
, if(gad.ad_type = 'expandedDynamicSearch', 'Expanded Dynamic Search', if(gad.ad_type = 'expandedText', 'Expanded Text Ad', if(gad.ad_type = 'responsiveSearch', 'Responsive Search Ad'))) ad_type
, gad.device_type
, gad.title1
, gad.title2
, gad.title3
, gad.title4
, gad.title5
, gad.title6
, gad.title7
, gad.title8
, gad.title9
, gad.title10
, gad.title11
, gad.title12
, gad.title13
, gad.title14
, gad.title15
, gad.description1
, gad.description2
, gad.description3
, gad.description4
, gad.display_url
, gad.path1
, gad.path2
, gad.destination_url
from paid.google_account ga
inner join stage.google_campaign gc
on ga.id = gc.account_id
inner join stage.google_ad_group gag
on gc.id = gag.campaign_id
inner join stage.google_ad gad
on gag.id = gad.ad_group_id
where ga.name like '%Smart Bidding%'

--keywords
select gk.id
, gk.ad_group_id
, if(gk.status = 'enabled', 'Active', if(gk.status = 'deleted', 'Deleted', 'Paused')) status
, gk.match_type
, gk.content
, gk.cpc_bid
, gk.negative
from paid.google_account ga
inner join stage.google_campaign gc
on ga.id = gc.account_id
inner join stage.google_ad_group gag
on gc.id = gag.campaign_id
inner join stage.google_keyword gk
on gag.id = gk.ad_group_id
where ga.name like '%Smart Bidding%'
