#!/bin/sh
# Identity gate: a commit in this repo is signed with the email set in THIS repo's own git
# config, never with one inherited from the machine-wide config. A machine can hold an email
# that belongs to another account; without this gate that email lands on public commits.
#   --commit            refuse when the repo has no email of its own, or the commit would not use it
#   --push <remote>     refuse when an outgoing commit carries the machine-wide email (refs on stdin)
# Fix for a refusal: git config --local user.email <the email for this repo>

mode="$1"
remote_name="$2"
own="$(git config --local user.email || true)"

refuse() {
  echo "" >&2
  echo "✖ identity gate: $1" >&2
  echo "  Set the email for this repo: git config --local user.email <email>" >&2
  echo "" >&2
  exit 1
}

email_of() {
  # "Name <email> 1700000000 +0000" → email
  git var "$1" | sed -e 's/^.*<//' -e 's/>.*$//'
}

[ -n "$own" ] || refuse "this repo has no email of its own, so git would take the machine-wide one."

case "$mode" in
  --commit)
    author="$(email_of GIT_AUTHOR_IDENT)"
    committer="$(email_of GIT_COMMITTER_IDENT)"
    [ "$author" = "$own" ] || refuse "the author email is not the email set for this repo."
    [ "$committer" = "$own" ] || refuse "the committer email is not the email set for this repo."
    ;;
  --push)
    machine="$(git config --global user.email || true)"
    # Same email on both sides, or no machine-wide email: nothing foreign can be pushed.
    if [ -z "$machine" ] || [ "$machine" = "$own" ]; then exit 0; fi
    zero="0000000000000000000000000000000000000000"
    while read -r _local_ref local_sha _remote_ref remote_sha; do
      [ -z "$local_sha" ] && continue
      [ "$local_sha" = "$zero" ] && continue
      if [ "$remote_sha" = "$zero" ]; then
        range="$local_sha --not --remotes=$remote_name"
      else
        range="$remote_sha..$local_sha"
      fi
      # shellcheck disable=SC2086
      bad="$(git log --format='%h %ae %ce' $range | grep -F -c " $machine" || true)"
      [ "$bad" = "0" ] || refuse "$bad outgoing commit(s) carry the machine-wide email instead of this repo's own."
    done
    ;;
  *)
    echo "usage: check-commit-identity.sh --commit | --push <remote>" >&2
    exit 2
    ;;
esac

exit 0
