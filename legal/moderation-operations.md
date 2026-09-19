# RATIO 신고·콘텐츠 검토 운영 절차

이 문서는 운영자 전용입니다. 앱에 `service_role` 키를 넣지 말고 Supabase Dashboard의 SQL Editor에서만 처리합니다.

## 매일 확인할 목록

```sql
select m.created_at, m.owner_id, m.recipe_id, m.status, m.review_note,
       a.state->'recipes' as owner_recipes
from public.recipe_moderation m
join public.cafe_accounts a on a.owner_id=m.owner_id
where m.status='pending'
order by m.created_at;

select id, created_at, reporter_id, target_type, target_id, reason, status
from public.reports
where status='open'
order by created_at;
```

## 레시피 승인 또는 반려

`owner_id`와 `recipe_id`를 반드시 검토 목록에서 복사합니다.

```sql
update public.recipe_moderation
set status='approved', review_note=null, reviewed_at=now(), updated_at=now()
where owner_id='OWNER_UUID' and recipe_id='RECIPE_ID' and status='pending';

update public.recipe_moderation
set status='rejected', review_note='반려 사유', reviewed_at=now(), updated_at=now()
where owner_id='OWNER_UUID' and recipe_id='RECIPE_ID' and status='pending';
```

승인·반려가 바뀌면 트리거가 공개 카탈로그를 자동 갱신합니다. 심각한 위반 콘텐츠를 계정 상태에서도 제거해야 하면 해당 이용자에게 수정을 요청하거나 계정 조치를 진행합니다.

## 신고 처리

```sql
update public.reports
set status='resolved', review_note='처리 내용', reviewed_at=now()
where id='REPORT_UUID' and status='open';

update public.reports
set status='dismissed', review_note='위반 없음', reviewed_at=now()
where id='REPORT_UUID' and status='open';
```

중대한 안전·불법·개인정보 노출 신고를 우선 처리합니다. 신고 자료는 일반 이용자가 읽을 수 없고 Dashboard의 관리자 권한으로만 확인합니다. 처리 이력에는 민감정보를 불필요하게 복사하지 않습니다.

## 운영 기준

- 신규·수정 레시피와 열린 신고를 매일 확인합니다.
- 목표 처리 시간은 일반 신고 72시간 이내, 긴급 안전 신고 24시간 이내입니다.
- 판단 기준은 `legal/community-guidelines.md`입니다.
- 반복 위반자는 추가 게시를 반려하고 필요하면 계정을 삭제합니다.
- 이메일 신고와 Dashboard 조치를 함께 기록하되, 공개 저장소에는 신고자 정보나 원문을 남기지 않습니다.
- 월 1회 아래 쿼리로 처리 완료 후 1년이 지난 신고를 파기합니다. 법적 분쟁 보존이 필요한 건은 별도 근거와 종료일을 기록하고 제외합니다.

```sql
delete from public.reports
where status in ('resolved','dismissed')
  and reviewed_at < now() - interval '1 year';
```
