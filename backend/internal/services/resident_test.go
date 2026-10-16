package services

import "testing"

func TestResidentProgressAndNames(t *testing.T) {
	for _, c := range []struct{ xp, level, current, needed int }{{0, 1, 0, 30}, {29, 1, 29, 30}, {30, 2, 0, 50}, {80, 3, 0, 70}, {150, 4, 0, 100}, {250, 5, 0, 0}, {300, 5, 50, 0}} {
		l, cur, n, _ := ResidentProgress(c.xp)
		if l != c.level || cur != c.current || n != c.needed {
			t.Errorf("XP %d => %d/%d/%d", c.xp, l, cur, n)
		}
	}
	for _, name := range []string{"", "  ", "一二三四五六七八九十一二三", "a\nb"} {
		if _, err := ValidateResidentName(name); err == nil {
			t.Errorf("accepted %q", name)
		}
	}
	if name, err := ValidateResidentName(" 阿圆🌱 "); err != nil || name != "阿圆🌱" {
		t.Fatal("Unicode name validation")
	}
}
