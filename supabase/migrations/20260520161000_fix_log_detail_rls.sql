DROP POLICY IF EXISTS "Public read logs" ON logs;
CREATE POLICY "Public read logs" ON logs
  FOR SELECT USING (is_published = true);

DROP POLICY IF EXISTS "Owner full access logs" ON logs;
CREATE POLICY "Owner full access logs" ON logs
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public read profiles" ON profiles;
CREATE POLICY "Public read profiles" ON profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read comments" ON comments;
CREATE POLICY "Public read comments" ON comments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Auth insert comments" ON comments;
CREATE POLICY "Auth insert comments" ON comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public read likes" ON likes;
CREATE POLICY "Public read likes" ON likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Auth insert likes" ON likes;
CREATE POLICY "Auth insert likes" ON likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Auth delete likes" ON likes;
CREATE POLICY "Auth delete likes" ON likes
  FOR DELETE USING (auth.uid() = user_id);
