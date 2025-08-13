import { describe, it, expect } from 'vitest';
import { 
  Ok, 
  Err, 
  isOk, 
  isErr, 
  map, 
  mapErr, 
  flatMap, 
  unwrap, 
  unwrapOr, 
  fromPromise, 
  combine 
} from '../../../src/utils/result.js';

describe('Result utility', () => {
  describe('Ok and Err constructors', () => {
    it('should create successful result', () => {
      const result = Ok('success');
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
    });

    it('should create error result', () => {
      const error = new Error('test error');
      const result = Err(error);
      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe('Type guards', () => {
    it('should identify Ok results', () => {
      const result = Ok('test');
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it('should identify Err results', () => {
      const result = Err(new Error('test'));
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('map function', () => {
    it('should transform Ok values', () => {
      const result = Ok(5);
      const mapped = map(result, x => x * 2);
      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.data).toBe(10);
      }
    });

    it('should pass through Err values', () => {
      const error = new Error('test');
      const result = Err(error);
      const mapped = map(result, x => x * 2);
      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBe(error);
      }
    });
  });

  describe('mapErr function', () => {
    it('should transform Err values', () => {
      const result = Err('original error');
      const mapped = mapErr(result, err => new Error(err));
      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBeInstanceOf(Error);
        expect(mapped.error.message).toBe('original error');
      }
    });

    it('should pass through Ok values', () => {
      const result = Ok(42);
      const mapped = mapErr(result, err => new Error(String(err)));
      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.data).toBe(42);
      }
    });
  });

  describe('flatMap function', () => {
    it('should chain Ok results', () => {
      const result = Ok(5);
      const chained = flatMap(result, x => Ok(x * 2));
      expect(isOk(chained)).toBe(true);
      if (isOk(chained)) {
        expect(chained.data).toBe(10);
      }
    });

    it('should chain to Err results', () => {
      const result = Ok(5);
      const error = new Error('chain error');
      const chained = flatMap(result, () => Err(error));
      expect(isErr(chained)).toBe(true);
      if (isErr(chained)) {
        expect(chained.error).toBe(error);
      }
    });

    it('should pass through Err results', () => {
      const error = new Error('original error');
      const result = Err(error);
      const chained = flatMap(result, x => Ok(x * 2));
      expect(isErr(chained)).toBe(true);
      if (isErr(chained)) {
        expect(chained.error).toBe(error);
      }
    });
  });

  describe('unwrap function', () => {
    it('should return Ok value', () => {
      const result = Ok('success');
      expect(unwrap(result)).toBe('success');
    });

    it('should throw Err value', () => {
      const error = new Error('test error');
      const result = Err(error);
      expect(() => unwrap(result)).toThrow(error);
    });
  });

  describe('unwrapOr function', () => {
    it('should return Ok value', () => {
      const result = Ok('success');
      expect(unwrapOr(result, 'default')).toBe('success');
    });

    it('should return default for Err', () => {
      const result = Err(new Error('test'));
      expect(unwrapOr(result, 'default')).toBe('default');
    });
  });

  describe('fromPromise function', () => {
    it('should convert resolved promise to Ok', async () => {
      const promise = Promise.resolve('success');
      const result = await fromPromise(promise);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe('success');
      }
    });

    it('should convert rejected promise to Err', async () => {
      const error = new Error('promise error');
      const promise = Promise.reject(error);
      const result = await fromPromise(promise);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(error);
      }
    });

    it('should convert non-Error rejection to Error', async () => {
      const promise = Promise.reject('string error');
      const result = await fromPromise(promise);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('string error');
      }
    });
  });

  describe('combine function', () => {
    it('should combine Ok results', () => {
      const results = [Ok(1), Ok(2), Ok(3)] as const;
      const combined = combine(results);
      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.data).toEqual([1, 2, 3]);
      }
    });

    it('should return first Err result', () => {
      const error1 = new Error('error 1');
      const error2 = new Error('error 2');
      const results = [Ok(1), Err(error1), Err(error2)] as const;
      const combined = combine(results);
      expect(isErr(combined)).toBe(true);
      if (isErr(combined)) {
        expect(combined.error).toBe(error1);
      }
    });
  });
});
