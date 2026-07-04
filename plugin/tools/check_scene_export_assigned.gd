# tools/check_scene_export_assigned.gd — assert @export(s) wired non-null on live nodes in a scene.
# The "third data-driven half": authored + read is not enough — a green gate can hide a dead feature
# whose .tres was authored and code reads it, but the live node in the shipped .tscn never has it
# assigned. This tool loads a scene, instantiates it, and asserts each named export field is
# non-null on the named node. Game-agnostic: no hardcoded res:// paths; all inputs are parameters.
#
# Run: $GODOT --headless --path . --script tools/check_scene_export_assigned.gd -- \
#        <scene.tscn> <NodePath> <export_field> [<NodePath> <export_field> ...]
# scene.tscn: relative to res:// (e.g. levels/my_level.tscn)
# NodePath:   path to the node within the scene (e.g. HazardZone or Player/PlayerHealth)
# export_field: the @export field name to check (e.g. profile or config)
#
# Examples:
#   check one export:
#     $GODOT --headless --path . --script tools/check_scene_export_assigned.gd -- \
#       levels/my_level.tscn HazardZone profile
#   check multiple nodes at once:
#     $GODOT --headless --path . --script tools/check_scene_export_assigned.gd -- \
#       levels/my_level.tscn HazardZone profile DangerZone config Player health_component
#
# Exit 0 = all (node, field) pairs resolved non-null; 1 = any missing/null/absent.
extends SceneTree

var _fail_count: int = 0


func _initialize() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	# Need at least: <scene> <NodePath> <field> = 3 args, and args after the scene come in pairs.
	if args.size() < 3 or (args.size() - 1) % 2 != 0:
		push_error(
			(
				"check_scene_export_assigned: usage: <scene.tscn> (<NodePath> <field>)+ — got %d args"
				% args.size()
			)
		)
		quit(1)
		return
	var scene_path: String = "res://" + args[0]
	var packed := load(scene_path) as PackedScene
	if packed == null:
		push_error("check_scene_export_assigned: FAIL — cannot load scene: %s" % scene_path)
		quit(1)
		return
	var inst := packed.instantiate()
	root.add_child(inst)

	var i: int = 1
	while i + 1 < args.size():
		_check_one(inst, args[i], args[i + 1], scene_path)
		i += 2

	if is_instance_valid(inst):
		inst.queue_free()

	if _fail_count > 0:
		print(
			(
				"check_scene_export_assigned: FAIL — %d unwired export(s) in %s"
				% [_fail_count, args[0]]
			)
		)
	else:
		print("check_scene_export_assigned: OK — all exports wired non-null in %s" % args[0])
	quit(1 if _fail_count > 0 else 0)


func _check_one(inst: Node, node_path: String, field: String, scene_path: String) -> void:
	var node := inst.get_node_or_null(NodePath(node_path))
	if node == null:
		push_error(
			"check_scene_export_assigned: FAIL — %s has no node '%s'" % [scene_path, node_path]
		)
		_fail_count += 1
		return
	var value: Variant = node.get(field)
	if value == null:
		push_error(
			(
				"check_scene_export_assigned: FAIL — %s.%s is null (authored+read but NOT wired)"
				% [node_path, field]
			)
		)
		_fail_count += 1
		return
	print("  OK: %s.%s wired (%s)" % [node_path, field, str(value)])
