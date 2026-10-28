insert into public.instagram_media_assets
(asset_key, public_url, category, product_slug, locale, tags, approved, sendable, notes, updated_at)
values
('flavor:jalapeno-cheddar','https://bagelito.pe/images/bagel-jalapeno-cheddar.webp','bagel_flavor','jalapeno-cheddar','both',array['bagel','flavor','jalapeno','cheddar'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('flavor:cheddar','https://bagelito.pe/images/bagel-cheddar.webp','bagel_flavor','cheddar','both',array['bagel','flavor','cheddar'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('flavor:sesame','https://bagelito.pe/images/bagel-sesame.webp','bagel_flavor','sesame','both',array['bagel','flavor','sesame'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('flavor:everything-bagel','https://bagelito.pe/images/bagel-everything.webp','bagel_flavor','everything-bagel','both',array['bagel','flavor','everything'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('flavor:cinnamon-raisin','https://bagelito.pe/images/bagel-cinnamon-raisin.webp','bagel_flavor','cinnamon-raisin','both',array['bagel','flavor','cinnamon','raisin'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('flavor:blueberry','https://bagelito.pe/images/bagel-blueberry.webp','bagel_flavor','blueberry','both',array['bagel','flavor','blueberry'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('flavor:plain','https://bagelito.pe/images/bagel-plain.webp','bagel_flavor','plain','both',array['bagel','flavor','plain'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('flavor:classic-onion','https://bagelito.pe/images/bagel-classic-onion.webp','bagel_flavor','classic-onion','both',array['bagel','flavor','onion'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('flavor:rainbow-custom-colors','https://bagelito.pe/images/bagel-rainbow.webp','bagel_flavor','rainbow-custom-colors','both',array['bagel','flavor','rainbow','custom-colors'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('flavor:snickerdoodle','https://bagelito.pe/images/bagel-snickerdoodle.webp','bagel_flavor','snickerdoodle','both',array['bagel','flavor','snickerdoodle','seasonal'],true,false,'Approved storefront image. Seasonal; draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('pack:6-mixed','https://bagelito.pe/images/pack-6-mixed.webp','pack','6-mixed','both',array['pack','6','mixed'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('pack:6-single','https://bagelito.pe/images/pack-6-single.webp','pack','6-single','both',array['pack','6','single'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('pack:12-mixed','https://bagelito.pe/images/pack-12-mixed.webp','pack','12-mixed','both',array['pack','12','mixed'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('pack:12-single','https://bagelito.pe/images/pack-12-single.webp','pack','12-single','both',array['pack','12','single'],true,false,'Approved storefront image. Draft/suggestion ready; outbound format not yet validated for Meta.',now()),
('brand:bagelito','https://bagelito.pe/images/bagelito-og.png','brand',null,'both',array['bagelito','brand','menu','general'],true,true,'Approved PNG brand image; safe candidate for outbound image tests.',now())
on conflict (asset_key) do update set
 public_url=excluded.public_url,
 category=excluded.category,
 product_slug=excluded.product_slug,
 locale=excluded.locale,
 tags=excluded.tags,
 approved=excluded.approved,
 sendable=excluded.sendable,
 notes=excluded.notes,
 updated_at=excluded.updated_at;
