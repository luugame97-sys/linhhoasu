<?php
if ($argc < 2) {
    fwrite(STDERR, "usage: php test_giftcode_editor_20260915.php /path/admin_api.php\n");
    exit(2);
}

function check_editor($value, $message) {
    if (!$value) throw new RuntimeException($message);
}

$source = file_get_contents($argv[1]);
check_editor($source !== false, 'CANDIDATE_READ_FAILED');
check_editor(strpos($source, 'function admin_parse_reward_json($json, $limit = 20)') !== false, 'PARSER_DEFAULT_LIMIT_CHANGED');
check_editor(strpos($source, 'count(get_object_vars($items)) >= $limit') !== false, 'PARSER_LIMIT_MISSING');
check_editor(strpos($source, 'admin_parse_reward_json($has_reward_payload ? $_POST[\'items_json\'] : \'\', 250)') !== false, 'EDITOR_LIMIT_NOT_250');
check_editor(strpos($source, '$used_count > 0 &&') === false, 'USED_CODE_LOCK_STILL_PRESENT');
check_editor(strpos($source, 'Danh sách quà phải có ít nhất 1 vật phẩm hợp lệ.') !== false, 'EMPTY_REWARD_GUARD_MISSING');

check_editor(preg_match('/(function admin_parse_reward_json\(\$json, \$limit = 20\).*?)\nfunction admin_server_view/s', $source, $match) === 1, 'PARSER_EXTRACT_FAILED');
function hk_clean_reward_id($value) { return preg_replace('/^(item_|gift_|charge_|equip_)/', '', trim((string)$value)); }
function hk_reward_exists($value) { return ctype_digit((string)$value) && (int)$value > 0; }
eval($match[1]);

$input = array();
for ($id = 10001; $id <= 10251; $id++) $input[(string)$id] = 1;
$parsed = json_decode(admin_parse_reward_json(json_encode($input), 250), true);
check_editor(is_array($parsed), 'PARSER_OUTPUT_INVALID');
check_editor(count($parsed) === 250, 'PARSER_DID_NOT_KEEP_250_ITEMS');
check_editor(isset($parsed['10001']) && isset($parsed['10250']) && !isset($parsed['10251']), 'PARSER_CAP_BOUNDARY_INVALID');
check_editor(count(json_decode(admin_parse_reward_json(json_encode($input)), true)) === 20, 'CREATE_DEFAULT_LIMIT_CHANGED');
check_editor(admin_parse_reward_json('{}') === '', 'EMPTY_REWARD_NOT_REJECTED');

echo json_encode(array('result'=>'PASS','checks'=>11,'keptItems'=>count($parsed)), JSON_UNESCAPED_UNICODE) . PHP_EOL;
